// Generic signed token helper used by RSVP, password-reset, magic-link,
// and email-verification flows. HMAC-SHA256 over a JSON payload; the
// token itself is `base64url(payload).base64url(sig)`.
//
// Stateless (no DB row). For flows where one-time use matters (password
// reset, magic-link), the consumer's invariant should make replay a
// no-op — e.g. password-reset rotates the password's salt so old reset
// tokens for the previous hash become semantically meaningless after
// the user picks a new password. Hardening to a DB-backed token table
// is queued in ROADMAP.md as a [security] item.

import crypto from "node:crypto";

function b64u(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64uDecode(str) {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/**
 * @param {object} claims arbitrary JSON-serializable object
 * @param {object} opts   { secret, ttlSeconds }
 */
export function makeSignedToken(claims, { secret, ttlSeconds }) {
  if (!secret) throw new Error("secret required");
  const payload = {
    ...claims,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const buf = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = crypto.createHmac("sha256", secret).update(buf).digest();
  return `${b64u(buf)}.${b64u(sig)}`;
}

/**
 * @returns the claims object on success, null on tamper / expired / malformed.
 */
export function verifySignedToken(token, { secret }) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [pBuf, sBuf] = token.split(".");
  let payloadBuf, sigBuf;
  try {
    payloadBuf = b64uDecode(pBuf);
    sigBuf = b64uDecode(sBuf);
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", secret).update(payloadBuf).digest();
  if (sigBuf.length !== expected.length || !crypto.timingSafeEqual(sigBuf, expected)) {
    return null;
  }
  let claims;
  try {
    claims = JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return null;
  }
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return claims;
}
