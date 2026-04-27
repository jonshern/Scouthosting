// HMAC-signed RSVP tokens for one-click email links.
//
// Token format: base64url(payload).base64url(signature)
// payload = JSON of { eventId, name, email, exp } (exp = unix seconds)
// signature = HMAC-SHA256(payload, RSVP_SECRET)
//
// Stateless: no DB row. The token IS the RSVP authorization. Recipients
// can click Yes/No/Maybe straight from their inbox without logging in.

import crypto from "node:crypto";

const SECRET = process.env.RSVP_SECRET || "dev-rsvp-secret-do-not-use-in-prod";
const DEFAULT_TTL_DAYS = 60;

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

export function makeRsvpToken({ eventId, name, email, ttlDays = DEFAULT_TTL_DAYS }) {
  const payload = {
    eventId,
    name,
    email: String(email).toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60,
  };
  const payloadBuf = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = sign(payloadBuf);
  return `${b64u(payloadBuf)}.${b64u(sig)}`;
}

export function verifyRsvpToken(token) {
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

  if (!claims.eventId || !claims.email || !claims.name) return null;
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return null;

  return claims;
}
