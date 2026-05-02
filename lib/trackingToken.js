// HMAC-signed tracking tokens for email/SMS open + click measurement.
//
// Token format: base64url(payload).base64url(signature)
// payload = JSON of { mailLogId, recipient, kind, exp }
//   - kind: "o" (open) or "c" (click)
//   - recipient: lowercased email or E.164 phone, matched against
//     MailLog.recipients[]
// signature = HMAC-SHA256(payload, TRACKING_SECRET)
//
// Stateless — we never store the token. The token IS the claim that
// "this open/click belongs to recipient X for send Y." Tokens are
// long-lived (default 1 year) since a parent might open an old email
// months later.
//
// Click tokens carry only the destination URL's hash, not the URL
// itself; the public click endpoint accepts the URL via query string
// and verifies it against the hash to keep the token short and
// open-redirect-safe.

import crypto from "node:crypto";

const SECRET = process.env.TRACKING_SECRET || "dev-tracking-secret-do-not-use-in-prod";
const DEFAULT_TTL_DAYS = 365;

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

function sign(payloadBuf) {
  return crypto.createHmac("sha256", SECRET).update(payloadBuf).digest();
}

function urlHash(url) {
  // 8-byte (16-hex-char) SHA-256 prefix is plenty to defeat tampering
  // while keeping the token short enough for an SMS.
  return crypto.createHash("sha256").update(String(url)).digest("hex").slice(0, 16);
}

export function makeOpenToken({ mailLogId, recipient, ttlDays = DEFAULT_TTL_DAYS }) {
  const payload = {
    m: mailLogId,
    r: String(recipient).toLowerCase(),
    k: "o",
    exp: Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60,
  };
  const buf = Buffer.from(JSON.stringify(payload), "utf8");
  return `${b64u(buf)}.${b64u(sign(buf))}`;
}

export function makeClickToken({ mailLogId, recipient, url, ttlDays = DEFAULT_TTL_DAYS }) {
  const payload = {
    m: mailLogId,
    r: String(recipient).toLowerCase(),
    k: "c",
    h: urlHash(url),
    exp: Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60,
  };
  const buf = Buffer.from(JSON.stringify(payload), "utf8");
  return `${b64u(buf)}.${b64u(sign(buf))}`;
}

// Verifies a token and (for click tokens) that the supplied URL
// matches the embedded hash. Returns null on any failure so callers
// can short-circuit without leaking the failure reason.
export function verifyTrackingToken(token, { url } = {}) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;

  let payloadBuf, sigBuf;
  try {
    payloadBuf = b64uDecode(payloadB64);
    sigBuf = b64uDecode(sigB64);
  } catch {
    return null;
  }

  const expected = sign(payloadBuf);
  if (sigBuf.length !== expected.length || !crypto.timingSafeEqual(sigBuf, expected)) {
    return null;
  }

  let claims;
  try {
    claims = JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return null;
  }

  if (!claims.m || !claims.r || !claims.k) return null;
  if (claims.k !== "o" && claims.k !== "c") return null;
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return null;

  if (claims.k === "c") {
    if (!url) return null;
    if (claims.h !== urlHash(url)) return null;
  }

  return {
    mailLogId: claims.m,
    recipient: claims.r,
    kind: claims.k === "o" ? "open" : "click",
  };
}
