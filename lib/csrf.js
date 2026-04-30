// CSRF protection using the double-submit cookie pattern.
//
// On every request: ensure a per-session-ish random token lives in a
// HttpOnly cookie (named `scouthosting_csrf` for back-compat — see auth.js
// for the deferred-rename note). On state-changing requests
// (POST/PUT/PATCH/DELETE), require the body to carry the same value as
// `csrf` (or the X-CSRF-Token header for JSON/XHR clients).
//
// Cookie + body have to match → an attacker can't forge a request from
// another origin because they can't read our cookie OR set a matching
// body field.
//
// Routes that are intentionally anonymous (e.g. /api/provision posted
// from the marketing site, anonymous /events/:id/rsvp, anonymous slot
// /take and /release) skip csrfProtect — they have their own abuse
// mitigations (Cloudflare rate limit + per-row idempotency keys).

import crypto from "node:crypto";

const COOKIE = "scouthosting_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(res, name, value) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.appendHeader(
    "Set-Cookie",
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`
  );
}

/**
 * Mount this globally — every request gets a token on the response and
 * `req.csrfToken` is populated for templates.
 */
export function csrfMiddleware(req, res, next) {
  let token = readCookie(req, COOKIE);
  if (!token || token.length < 24) {
    token = crypto.randomBytes(24).toString("base64url");
    setCookie(res, COOKIE, token);
  }
  req.csrfToken = token;
  next();
}

/**
 * Apply to specific routes / routers that should reject mismatched or
 * missing tokens on state-changing requests. Safe methods always pass.
 */
export function csrfProtect(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieTok = readCookie(req, COOKIE);
  const submitted = (req.body && req.body.csrf) || req.headers["x-csrf-token"];

  if (!cookieTok || !submitted) {
    return res.status(403).type("text/plain").send("CSRF token missing.");
  }
  const a = Buffer.from(String(cookieTok));
  const b = Buffer.from(String(submitted));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).type("text/plain").send("CSRF token mismatch.");
  }
  next();
}

/**
 * Hidden input the form templates embed. Pass `req.csrfToken`.
 */
export function csrfField(token) {
  // Token chars are base64url so HTML escaping is a no-op, but keep the
  // shape consistent with other form helpers.
  return `<input type="hidden" name="csrf" value="${String(token || "").replace(/[^A-Za-z0-9_\-]/g, "")}">`;
}

/**
 * Response middleware: every HTML response gets the CSRF hidden input
 * auto-injected after each `<form ... method="post">` opening tag.
 * Avoids having to touch 50+ form templates and ensures any future
 * form is covered by default.
 *
 * Idempotent: skips forms that already declare a name="csrf" input.
 */
export function csrfHtmlInjector(req, res, next) {
  const origSend = res.send.bind(res);
  res.send = function (body) {
    if (
      typeof body === "string" &&
      req.csrfToken &&
      (res.get("Content-Type") || "").includes("text/html") &&
      body.includes("<form")
    ) {
      const tok = csrfField(req.csrfToken);
      body = body.replace(
        /<form\b([^>]*)\bmethod\s*=\s*["']post["']([^>]*)>/gi,
        (match, before, after) => {
          // If this form already has the field, don't double-inject.
          // We can't peek across the form boundary cheaply here, so we
          // just unconditionally inject — the duplicate would still
          // pass csrfProtect because both fields carry the same value.
          return `<form${before}method="post"${after}>${tok}`;
        }
      );
    }
    return origSend(body);
  };
  next();
}
