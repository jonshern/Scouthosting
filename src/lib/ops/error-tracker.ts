// Error tracking — backend-agnostic. Writes structured JSON to stdout
// AND persists to ErrorLog for the in-app /__super/errors viewer.
// PII scrubbing strips Authorization headers, cookies, and request
// bodies on auth-shaped routes.

import crypto from "node:crypto";
import { logger } from "@/lib/log";
import { prisma } from "@/lib/db";

const log = logger.child("error");

const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-api-key"]);
const AUTH_PATH_PREFIXES = ["/login", "/signup", "/forgot", "/reset", "/auth/", "/admin/login"];
const SENSITIVE_BODY_KEYS = new Set([
  "password",
  "newPassword",
  "currentPassword",
  "csrf",
  "token",
  "secret",
]);

function release(): string {
  return process.env.GIT_SHA || process.env.SOURCE_VERSION || "dev";
}
function environment(): string {
  return process.env.NODE_ENV || "development";
}

function scrubHeaders(
  headers: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!headers) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? "[scrubbed]" : v;
  }
  return out;
}

function scrubBody(path: string, body: unknown): unknown {
  if (!body || typeof body !== "object") return undefined;
  if (AUTH_PATH_PREFIXES.some((p) => path.startsWith(p))) return "[scrubbed: auth route]";
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = SENSITIVE_BODY_KEYS.has(k) ? "[scrubbed]" : v;
  }
  return out;
}

export type RequestLike = {
  method?: string;
  path?: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, unknown>;
  ip?: string;
  org?: { id?: string; slug?: string } | null;
  /** A unit slug when only that is known (a /o/<slug>/ path, a tenant host). */
  orgSlug?: string | null;
  user?: { id?: string } | null;
  /** Extra detail to keep with the row (an app's version, platform, screen). */
  context?: Record<string, unknown> | null;
  log?: { base?: { requestId?: string } };
} | null | undefined;

function requestContext(req: RequestLike) {
  if (!req) return undefined;
  return {
    method: req.method,
    path: req.path,
    query: req.query && Object.keys(req.query).length ? req.query : undefined,
    body: scrubBody(req.path || "", req.body),
    headers: scrubHeaders(req.headers),
    ip: req.ip,
    orgSlug: req.org?.slug ?? req.orgSlug ?? undefined,
    userId: req.user?.id,
    requestId: req.log?.base?.requestId,
  };
}

export function fingerprintError(err: unknown): string {
  const e = err instanceof Error ? err : new Error(String(err));
  const firstFrame =
    (e.stack || "").split("\n").find((l) => l.trim().startsWith("at "))?.trim() || "";
  const seed = `${e.name || "Error"}|${firstFrame || e.message || "unknown"}`;
  return crypto.createHash("sha1").update(seed).digest("hex");
}

export function formatErrorEvent(
  err: unknown,
  req: RequestLike,
  { service = "compass" }: { service?: string } = {},
) {
  const e = err instanceof Error ? err : new Error(String(err));
  return {
    "@type":
      "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
    severity: "ERROR",
    serviceContext: { service, version: release(), resourceType: "next" },
    environment: environment(),
    release: release(),
    error: { message: e.message, stack: e.stack, name: e.name },
    request: requestContext(req),
  };
}

async function persistError(
  err: unknown,
  req: RequestLike,
  { service }: { service?: string },
): Promise<void> {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const event = formatErrorEvent(err, req, { service });
    const truncate = (s: string | null | undefined, n: number) =>
      typeof s === "string" && s.length > n ? s.slice(0, n) : s;
    let orgId = req?.org?.id || null;
    const slug = req?.org?.slug || req?.orgSlug;
    if (!orgId && slug) {
      orgId = (await prisma.org.findUnique({ where: { slug }, select: { id: true } }))?.id ?? null;
    }
    await prisma.errorLog.create({
      data: {
        fingerprint: fingerprintError(err),
        message: truncate(e.message || "(no message)", 2000) || "(no message)",
        stack: truncate(e.stack || null, 8000) || null,
        errorName: truncate(e.name || null, 200) || null,
        method: req?.method || null,
        path: truncate(req?.path || null, 500) || null,
        orgId,
        userId: req?.user?.id || null,
        requestId: event.request?.requestId || null,
        ip: req?.ip || null,
        release: event.release,
        environment: event.environment,
        service: service ?? "compass",
        ...(req?.context ? { context: req.context as object } : {}),
      },
    });
  } catch (writeErr) {
    log.warn("errorLog persist failed", { err: writeErr });
  }
}

/**
 * Capture an error from a server action / route handler. Logs +
 * persists. Does not throw. Use in try/catch around any boundary
 * where you want the error in the /__super/errors viewer.
 */
export async function captureError(
  err: unknown,
  req: RequestLike = null,
  { service }: { service?: string } = {},
): Promise<void> {
  const event = formatErrorEvent(err, req, { service });
  log.error("unhandled exception", event);
  await persistError(err, req, { service });
}

/**
 * Process-level fatal handlers. Set up once at boot via
 * src/instrumentation.ts (Next.js's instrumentation hook).
 */
export function installFatalHandlers({ service }: { service?: string } = {}): void {
  process.on("uncaughtException", (err) => {
    log.error("uncaughtException", formatErrorEvent(err, null, { service }));
    setTimeout(() => process.exit(1), 100).unref();
  });
  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    log.error("unhandledRejection", formatErrorEvent(err, null, { service }));
    void persistError(err, null, { service });
  });
}

/**
 * A crash one of the apps reported (POST /api/v1/errors). Kept in the
 * same ErrorLog as server errors, under service "<product>-app", with
 * the app's own fingerprint so repeats group together.
 */
export async function recordAppError(input: {
  product: string;
  name?: string | null;
  message: string;
  stack?: string | null;
  userId?: string | null;
  context?: Record<string, unknown> | null;
  ip?: string | null;
}): Promise<{ fingerprint: string }> {
  const e = new Error(input.message);
  e.name = input.name || "Error";
  e.stack = input.stack || `${e.name}: ${input.message}`;
  // No stack frame to go on: group by name and message instead.
  const fingerprint = /\n\s*at /.test(e.stack)
    ? fingerprintError(e)
    : crypto.createHash("sha1").update(`${input.product}|${e.name}|${input.message}`).digest("hex");
  await prisma.errorLog.create({
    data: {
      fingerprint,
      message: input.message.slice(0, 2000),
      stack: e.stack.slice(0, 8000),
      errorName: e.name.slice(0, 200),
      userId: input.userId ?? null,
      ip: input.ip ?? null,
      service: `${input.product}-app`,
      release: typeof input.context?.appVersion === "string" ? input.context.appVersion.slice(0, 50) : null,
      environment: "app",
      ...(input.context ? { context: input.context as object } : {}),
    },
  });
  return { fingerprint };
}
