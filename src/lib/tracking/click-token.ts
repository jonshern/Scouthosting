// HMAC-signed tracking tokens for email/SMS open + click measurement.
//
// Token format: base64url(payload).base64url(signature)
// payload = JSON of { m: mailLogId, r: recipient, k: kind, [h: urlHash,] exp }
//   - kind 'o' = open, 'c' = click
// signature = HMAC-SHA256(payload, TRACKING_SECRET)
//
// Stateless — the token IS the claim. Tokens are long-lived (default
// 1 year) since a parent might open an old email months later.
//
// Click tokens carry only the destination URL's hash, not the URL
// itself; the click endpoint accepts the URL via query string and
// verifies it against the hash to keep the token short and
// open-redirect-safe.

import crypto from "node:crypto";
import { linkSecret } from "@/lib/security/link-secret";

const DEFAULT_TTL_DAYS = 365;

function secretFor(): string {
  return linkSecret(["TRACKING_SECRET"], "dev-tracking-secret-do-not-use-in-prod");
}

function b64u(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64uDecode(str: string): Buffer {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payloadBuf: Buffer): Buffer {
  return crypto.createHmac("sha256", secretFor()).update(payloadBuf).digest();
}

function urlHash(url: string): string {
  return crypto.createHash("sha256").update(String(url)).digest("hex").slice(0, 16);
}

export function makeOpenToken(args: {
  mailLogId: string;
  recipient: string;
  ttlDays?: number;
}): string {
  const ttlDays = args.ttlDays ?? DEFAULT_TTL_DAYS;
  const payload = {
    m: args.mailLogId,
    r: String(args.recipient).toLowerCase(),
    k: "o",
    exp: Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60,
  };
  const buf = Buffer.from(JSON.stringify(payload), "utf8");
  return `${b64u(buf)}.${b64u(sign(buf))}`;
}

export function makeClickToken(args: {
  mailLogId: string;
  recipient: string;
  url: string;
  ttlDays?: number;
}): string {
  const ttlDays = args.ttlDays ?? DEFAULT_TTL_DAYS;
  const payload = {
    m: args.mailLogId,
    r: String(args.recipient).toLowerCase(),
    k: "c",
    h: urlHash(args.url),
    exp: Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60,
  };
  const buf = Buffer.from(JSON.stringify(payload), "utf8");
  return `${b64u(buf)}.${b64u(sign(buf))}`;
}

export type TrackingClaims = {
  mailLogId: string;
  recipient: string;
  kind: "open" | "click";
};

export function verifyTrackingToken(
  token: string | null | undefined,
  opts: { url?: string } = {},
): TrackingClaims | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;

  let payloadBuf: Buffer;
  let sigBuf: Buffer;
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

  let claims: { m?: string; r?: string; k?: string; h?: string; exp?: number };
  try {
    claims = JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return null;
  }

  if (!claims.m || !claims.r || !claims.k) return null;
  if (claims.k !== "o" && claims.k !== "c") return null;
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  if (claims.k === "c") {
    if (!opts.url) return null;
    if (claims.h !== urlHash(opts.url)) return null;
  }

  return {
    mailLogId: claims.m,
    recipient: claims.r,
    kind: claims.k === "o" ? "open" : "click",
  };
}
