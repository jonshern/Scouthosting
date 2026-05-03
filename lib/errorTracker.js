// Error tracking — backend-agnostic error capture that writes
// structured JSON to stdout. Any log-aggregation backend can pick it
// up:
//
//   GCP Cloud Run + Cloud Error Reporting → free, auto-extracts errors
//     from the @type field. Zero extra config.
//   Grafana Cloud → set OTEL_EXPORTER_OTLP_ENDPOINT; the existing OTel
//     setup in lib/otel.js ships logs alongside traces.
//   Honeycomb / Datadog / etc. → same OTel exporter, different endpoint.
//
// PII scrubbing strips Authorization headers, cookies, and request
// bodies on auth-shaped routes (/login, /forgot, /signup, /reset)
// so credentials never land in error reports.
//
// Release tagging reads GIT_SHA from the environment (set by the
// Dockerfile / CI). Falls back to "dev" when unset.

import { logger } from "./log.js";

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

function release() {
  return process.env.GIT_SHA || process.env.SOURCE_VERSION || "dev";
}

function environment() {
  return process.env.NODE_ENV || "development";
}

function scrubHeaders(headers) {
  if (!headers) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(k.toLowerCase())) {
      out[k] = "[scrubbed]";
    } else {
      out[k] = v;
    }
  }
  return out;
}

function scrubBody(path, body) {
  if (!body || typeof body !== "object") return undefined;
  // Auth-shaped paths: drop the body entirely. The presence of a body
  // is enough signal; the contents are credentials we never want
  // shipped to a logging backend.
  if (AUTH_PATH_PREFIXES.some((p) => path.startsWith(p))) {
    return "[scrubbed: auth route]";
  }
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    out[k] = SENSITIVE_BODY_KEYS.has(k) ? "[scrubbed]" : v;
  }
  return out;
}

function requestContext(req) {
  if (!req) return undefined;
  return {
    method: req.method,
    path: req.path,
    query: req.query && Object.keys(req.query).length ? req.query : undefined,
    body: scrubBody(req.path || "", req.body),
    headers: scrubHeaders(req.headers),
    ip: req.ip,
    orgSlug: req.org?.slug,
    userId: req.user?.id,
    requestId: req.log?.base?.requestId, // we set this in attachSession's middleware chain
  };
}

/**
 * Build the structured error event. The `@type` field at the top is
 * the magic incantation Cloud Error Reporting uses to auto-extract
 * error events from logs — costs nothing on other backends.
 *
 * Returns a plain object ready to pass to logger.error() as fields.
 */
export function formatErrorEvent(err, req, { service = "compass" } = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  return {
    "@type":
      "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
    severity: "ERROR",
    serviceContext: {
      service,
      version: release(),
      resourceType: "express",
    },
    environment: environment(),
    release: release(),
    error: {
      message: e.message,
      stack: e.stack,
      name: e.name,
    },
    request: requestContext(req),
  };
}

/**
 * Express error-handler middleware. Mount LAST in the middleware
 * chain — Express identifies error handlers by their 4-arg signature.
 *
 * Logs the error via the per-request logger when available so the
 * orgSlug + requestId attached upstream flow into the error event.
 * Sends a generic 500 response (HTML or JSON depending on the
 * client's Accept header) — never echoes the stack trace back.
 */
export function expressErrorHandler({ service } = {}) {
  // eslint-disable-next-line no-unused-vars
  return function compassErrorHandler(err, req, res, next) {
    if (res.headersSent) {
      // Express docs: if headers are already sent, must delegate to the
      // default handler (which closes the connection).
      return next(err);
    }
    const event = formatErrorEvent(err, req, { service });
    const reqLog = req.log || log;
    reqLog.error("unhandled exception", event);

    const wantsJson =
      req.path?.startsWith("/api/") ||
      (req.headers?.accept || "").includes("application/json");
    res.status(err.status || 500);
    if (wantsJson) {
      res.json({ error: "internal_error", requestId: event.request?.requestId });
    } else {
      res.type("text/plain").send("Something went wrong on our end. Try again, or come back in a minute.");
    }
  };
}

/**
 * Process-level fatal handlers. Set up once at boot. Logs and exits
 * — uncaughtException + unhandledRejection are signals that Node's
 * internal state may be corrupted. The process supervisor (PM2 / Fly
 * machines / Cloud Run) restarts us; that's the right shape for an
 * unrecoverable crash.
 */
export function installFatalHandlers({ service } = {}) {
  process.on("uncaughtException", (err) => {
    log.error("uncaughtException", formatErrorEvent(err, null, { service }));
    // Allow stdout to flush, then bail.
    setTimeout(() => process.exit(1), 100).unref();
  });
  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    log.error("unhandledRejection", formatErrorEvent(err, null, { service }));
  });
}
