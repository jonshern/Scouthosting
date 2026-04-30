// Resend webhook signature verification + event normalization.
//
// Resend uses Svix-style signing: the request carries three headers,
//   svix-id          (uuid)
//   svix-timestamp   (unix seconds)
//   svix-signature   (one or more "v1,<base64-sig>" tokens; comma-separated
//                     when the secret is being rotated)
// and the signed payload is the literal string `${id}.${timestamp}.${body}`.
// Signature is HMAC-SHA256 with a secret that's `whsec_<base64-of-bytes>`.
//
// We expose `verifyResendSignature(headers, rawBody, secret)` so the
// route can keep its raw body buffer untouched and run the check
// before parsing JSON.

import crypto from "node:crypto";

const TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * @param {Record<string,string>} headers
 * @param {string|Buffer} rawBody
 * @param {string} secret  e.g. "whsec_abc..."
 * @param {{ now?: Date }} [opts]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function verifyResendSignature(headers, rawBody, secret, opts = {}) {
  const id = headers["svix-id"] || headers["Svix-Id"];
  const ts = headers["svix-timestamp"] || headers["Svix-Timestamp"];
  const sigHeader = headers["svix-signature"] || headers["Svix-Signature"];
  if (!id || !ts || !sigHeader) return { ok: false, reason: "missing_headers" };
  if (!secret) return { ok: false, reason: "missing_secret" };

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad_timestamp" };
  const now = opts.now ? opts.now.getTime() : Date.now();
  if (Math.abs(now - tsNum * 1000) > TOLERANCE_MS) {
    return { ok: false, reason: "timestamp_skew" };
  }

  const keyBytes = parseSecret(secret);
  if (!keyBytes) return { ok: false, reason: "bad_secret" };

  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const signedContent = `${id}.${ts}.${body}`;
  const expected = crypto
    .createHmac("sha256", keyBytes)
    .update(signedContent)
    .digest("base64");

  // The header is space-separated tokens like "v1,<sig> v1,<sig>" during
  // a key rotation. Match any one.
  const tokens = sigHeader.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const [scheme, b64] = tok.split(",", 2);
    if (scheme !== "v1") continue;
    if (timingSafeEqualBase64(b64, expected)) return { ok: true };
  }
  return { ok: false, reason: "no_match" };
}

function parseSecret(secret) {
  // Accept both `whsec_<base64>` and a raw base64 secret.
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    return Buffer.from(raw, "base64");
  } catch {
    return null;
  }
}

function timingSafeEqualBase64(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Boil a Resend webhook event down to the bits we act on:
 *   { kind: "bounced"|"complained"|null, email, reason }
 *
 * Other event types (delivered / sent / opened / clicked) collapse to
 * `null` so the handler can ignore them.
 */
export function normalizeResendEvent(event) {
  if (!event || typeof event !== "object") return { kind: null };
  const type = String(event.type || "");
  const data = event.data || {};
  const email = pickEmail(data);
  if (type === "email.bounced") {
    const cls = data.bounce?.bounceType
      ? `bounced:${String(data.bounce.bounceType).toLowerCase()}`
      : "bounced";
    return { kind: "bounced", email, reason: cls };
  }
  if (type === "email.complained") {
    return { kind: "complained", email, reason: "complained" };
  }
  return { kind: null, email };
}

function pickEmail(data) {
  // Resend's payload puts the recipient in data.to; it's a list when
  // the message was sent to multiple recipients but we send 1:1 from
  // sendBatch so the list is single-element. Defensive: take the first.
  if (Array.isArray(data.to) && data.to.length) return String(data.to[0] || "").toLowerCase();
  if (typeof data.to === "string") return data.to.toLowerCase();
  return "";
}

export const _internal = { TOLERANCE_MS, parseSecret };
