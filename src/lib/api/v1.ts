// Shared plumbing for the /api/v1 mobile API.
//
// Every v1 route is built with `v1Route()`, which gives it, in order:
//
//   1. a per-IP limit (only when the platform's client-IP header is
//      trusted; see lib/security/client-ip),
//   2. bearer-token auth (lib/auth/api-bearer),
//   3. a per-user limit, plus any route-specific limits,
//   4. typed, awaited route params,
//   5. one error shape for every failure: `{ error: "<code>", ... }`
//      with the right status. Handlers throw `ApiError` (or a ZodError
//      from the helpers below) instead of building responses by hand,
//      and anything unexpected becomes a logged 500 `{ error: "internal" }`
//      that never echoes internals to the client.
//
// The mobile client branches on `error` (mobile/src/api/client.ts), so
// codes are part of the contract: add new ones, don't rename old ones.

import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodTypeAny } from "zod";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { logger } from "@/lib/log";

const log = logger.child("api-v1");

export type ApiUser = { id: string; email: string; displayName: string };

export type RouteLimit = { bucket: string; limit: number; windowMs: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Ceiling per client IP across all v1 calls (pre-auth). */
export const IP_LIMIT = { limit: 600, windowMs: MINUTE };
/** Ceiling per signed-in user across all v1 calls. */
export const USER_LIMIT = { limit: 300, windowMs: MINUTE };

/** Route-specific budgets, on top of USER_LIMIT. */
export const LIMITS = {
  chatPost: { bucket: "chat-post", limit: 30, windowMs: MINUTE },
  reaction: { bucket: "reaction", limit: 60, windowMs: MINUTE },
  rsvp: { bucket: "rsvp", limit: 30, windowMs: MINUTE },
  slot: { bucket: "slot", limit: 30, windowMs: MINUTE },
  photoUpload: { bucket: "photo-upload", limit: 60, windowMs: HOUR },
  push: { bucket: "push", limit: 20, windowMs: HOUR },
  support: { bucket: "support", limit: 5, windowMs: HOUR },
} satisfies Record<string, RouteLimit>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
    readonly headers: Record<string, string> = {},
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export const badRequest = (code: string, extra?: Record<string, unknown>) =>
  new ApiError(400, code, extra);
export const forbidden = (reason?: string) =>
  new ApiError(403, "forbidden", reason ? { reason } : {});
export const notFound = (code = "not_found") => new ApiError(404, code);

const NO_STORE = { "Cache-Control": "private, no-store" };

export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { ...NO_STORE, ...init.headers },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return json({ error: err.code, ...err.extra }, { status: err.status, headers: err.headers });
  }
  if (err instanceof ZodError) {
    // A schema can name its own code by giving a snake_case message
    // (e.g. `.min(1, "missing_token")`), which keeps the codes older
    // mobile builds already know. Otherwise: invalid_request.
    const first = err.issues[0]?.message ?? "";
    return json(
      {
        error: /^[a-z][a-z0-9_]*$/.test(first) ? first : "invalid_request",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  log.error("unhandled error in v1 route", { err });
  return json({ error: "internal" }, { status: 500 });
}

function tooMany(resetMs: number): ApiError {
  const retryAfter = String(Math.max(1, Math.ceil(resetMs / 1000)));
  return new ApiError(429, "rate_limited", { retryAfter: Number(retryAfter) }, { "Retry-After": retryAfter });
}

async function enforce(key: string, limit: number, windowMs: number): Promise<void> {
  const r = await rateLimit(key, limit, windowMs);
  if (!r.ok) throw tooMany(r.resetMs);
}

export type V1Context<P> = { user: ApiUser; tokenId: string; params: P };

type NextCtx<P> = { params: Promise<P> };

/**
 * Wrap a bearer-authenticated v1 handler. `limits` adds route-specific
 * per-user budgets on top of the global per-IP and per-user ones.
 */
export function v1Route<P extends Record<string, string | string[]> = Record<string, never>>(
  handler: (req: NextRequest, ctx: V1Context<P>) => Promise<Response>,
  opts: { limits?: RouteLimit[] } = {},
) {
  return async function route(req: NextRequest, nextCtx?: NextCtx<P>): Promise<Response> {
    try {
      const ip = clientIp(req.headers);
      if (ip) await enforce(`v1:ip:${ip}`, IP_LIMIT.limit, IP_LIMIT.windowMs);

      const authed = withBearerAuth(async (r, { user, tokenId }) => {
        try {
          await enforce(`v1:user:${user.id}`, USER_LIMIT.limit, USER_LIMIT.windowMs);
          for (const l of opts.limits ?? []) {
            await enforce(`v1:user:${user.id}:${l.bucket}`, l.limit, l.windowMs);
          }
          const params = ((await nextCtx?.params) ?? {}) as P;
          const res = await handler(r, { user, tokenId, params });
          res.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
          return res;
        } catch (err) {
          return errorResponse(err);
        }
      });
      const res = await authed(req);
      if (res.status === 401) res.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
      return res;
    } catch (err) {
      return errorResponse(err);
    }
  };
}

// ---------------------------------------------------------------------
// Input helpers. All throw ApiError / ZodError, which v1Route shapes.

/** Ids in paths are cuids or slugs; reject anything else before a query. */
export const IdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "invalid id");

export function parseId(value: unknown, code = "not_found"): string {
  const r = IdSchema.safeParse(value);
  if (!r.success) throw notFound(code);
  return r.data;
}

const MAX_JSON_BYTES = 64 * 1024;

export async function readJson<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.output<S>> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_JSON_BYTES) throw new ApiError(413, "too_large");
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw badRequest("bad_json");
  }
  if (Buffer.byteLength(text) > MAX_JSON_BYTES) throw new ApiError(413, "too_large");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest("bad_json");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw badRequest("bad_json");
  return schema.parse(raw);
}

export function readQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): z.output<S> {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    if (!(k in obj)) obj[k] = v;
  });
  return schema.parse(obj);
}

/** Optional ISO-8601 timestamp query param → Date. */
export const IsoDate = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO-8601 timestamp")
  .transform((s) => new Date(s));

// ---------------------------------------------------------------------
// Authorization helpers.

export type OrgAccess = {
  org: { id: string; slug: string; displayName: string; suspendedAt: Date | null };
  role: "scout" | "parent" | "leader" | "admin";
};

const ORG_SELECT = { id: true, slug: true, displayName: true, suspendedAt: true } as const;

/**
 * Resolve an org by id or slug and require the user to belong to it.
 * Missing org → 404. Not a member → 403 (org slugs are public, so this
 * reveals nothing new). `write` additionally refuses suspended orgs,
 * which are read-only. `roles` narrows who may proceed.
 */
export async function requireOrgAccess(
  idOrSlug: string,
  userId: string,
  opts: { write?: boolean; roles?: OrgAccess["role"][] } = {},
): Promise<OrgAccess> {
  const key = parseId(idOrSlug);
  const org = await prisma.org.findFirst({
    where: { OR: [{ id: key }, { slug: key }] },
    select: ORG_SELECT,
  });
  if (!org) throw notFound();
  return checkMembership(org, userId, opts, false);
}

/**
 * Same checks for a resource addressed by its own id. A non-member gets
 * 404, not 403, so ids can't be probed to learn what exists elsewhere.
 */
export async function requireOrgAccessForResource(
  orgId: string,
  userId: string,
  opts: { write?: boolean; roles?: OrgAccess["role"][] } = {},
): Promise<OrgAccess> {
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: ORG_SELECT });
  if (!org) throw notFound();
  return checkMembership(org, userId, opts, true);
}

async function checkMembership(
  org: OrgAccess["org"],
  userId: string,
  opts: { write?: boolean; roles?: OrgAccess["role"][] },
  hideExistence: boolean,
): Promise<OrgAccess> {
  const m = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId: org.id } },
    select: { role: true },
  });
  if (!m) throw hideExistence ? notFound() : forbidden();
  if (opts.roles && !opts.roles.includes(m.role)) throw forbidden("role");
  if (opts.write && org.suspendedAt) throw new ApiError(423, "org_suspended");
  return { org, role: m.role };
}

export const LEADER_ROLES: OrgAccess["role"][] = ["leader", "admin"];
