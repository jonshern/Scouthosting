// Lightweight bot deterrents for public signup-like forms.
//
// Two layered checks:
//   1. Honeypot field — a hidden form input with a name bots love
//      (`homepage_url` / `website` / etc.). Real browsers leave it
//      blank; naive form-spammers fill it in.
//   2. Minimum render-to-submit time — render an HMAC-signed
//      timestamp; on submit, reject if the form was submitted faster
//      than humans typically can (default 2 seconds).
//
// Neither is a hard wall — a determined adversary can defeat both —
// but combined with the existing rate limit they kill 99% of casual
// signup spam without making real humans pass a CAPTCHA.

import crypto from "node:crypto";

const HONEYPOT_FIELD = "homepage_url";
const TIME_FIELD = "form_started_at";
const MIN_FILL_MS = 2000;

function secret() {
  return (
    process.env.HONEYPOT_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.RSVP_SECRET ||
    "dev-secret-do-not-use-in-prod"
  );
}

function sign(ts) {
  const h = crypto.createHmac("sha256", secret()).update(String(ts)).digest("base64url");
  return `${ts}.${h.slice(0, 16)}`;
}

function verifyTimestamp(token, { now = Date.now(), minMs = MIN_FILL_MS } = {}) {
  if (typeof token !== "string" || !token.includes(".")) return false;
  const [tsRaw, sig] = token.split(".");
  const ts = parseInt(tsRaw, 10);
  if (!Number.isFinite(ts)) return false;
  const expected = crypto
    .createHmac("sha256", secret())
    .update(String(ts))
    .digest("base64url")
    .slice(0, 16);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  if (now - ts < minMs) return false;       // submitted too fast
  if (now - ts > 24 * 60 * 60_000) return false; // form is older than a day
  return true;
}

/**
 * Hidden HTML to embed in any public-facing signup form. Renders the
 * honeypot input + the signed timestamp.
 */
export function honeypotFields() {
  const ts = sign(Date.now());
  return (
    `<div style="position:absolute;left:-9999px;top:-9999px" aria-hidden="true">` +
    `<label>Website<input name="${HONEYPOT_FIELD}" type="text" tabindex="-1" autocomplete="off"></label>` +
    `</div>` +
    `<input type="hidden" name="${TIME_FIELD}" value="${ts}">`
  );
}

/**
 * Inspect a request body. Returns { ok: true } if the submission looks
 * human, otherwise { ok: false, reason }. Reasons are coarse — we
 * don't surface them to the user; just log them and treat the request
 * as if it had silently failed.
 */
export function verifyHoneypot(body, opts) {
  const trap = body?.[HONEYPOT_FIELD];
  if (typeof trap === "string" && trap.trim() !== "") {
    return { ok: false, reason: "honeypot-tripped" };
  }
  const tok = body?.[TIME_FIELD];
  if (!tok || !verifyTimestamp(tok, opts)) {
    return { ok: false, reason: "bad-timing" };
  }
  return { ok: true };
}

// Exported for tests.
export const _internal = { sign, verifyTimestamp, HONEYPOT_FIELD, TIME_FIELD };
