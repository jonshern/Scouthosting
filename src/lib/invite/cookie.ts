// Edge-runtime-safe cookie HMAC for the apex invite gate.
//
// Next.js middleware runs in the Edge runtime, which does NOT have
// `node:crypto` or `Buffer`. Web Crypto + manual base64url is the
// portable surface that works in both edge and node.
//
// The cookie payload is `${codeId}.${exp}.${sig}` where sig is
// HMAC-SHA256 over `${codeId}.${exp}` using SESSION_SECRET (or
// BETTER_AUTH_SECRET). exp is
// a unix-seconds timestamp.

export const INVITE_COOKIE = "compass_invite";
export const INVITE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Same rule as lib/security/link-secret.ts, written out with static
// process.env reads because this runs in middleware: never sign with a
// key from the source code in production.
function getSecret(): string {
  const v = process.env.SESSION_SECRET || process.env.BETTER_AUTH_SECRET;
  if (v) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error("No secret for the invite cookie: set SESSION_SECRET (openssl rand -hex 32).");
  }
  return "dev-only-not-secret-replace-in-prod-0123456789abcdef";
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const std = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256(payload: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return new Uint8Array(sig);
}

export async function makeInviteCookie(
  codeId: string,
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  const exp = now + INVITE_TTL_SECONDS;
  const body = `${codeId}.${exp}`;
  const sig = await hmacSha256(body, getSecret());
  return `${body}.${bytesToBase64Url(sig)}`;
}

export async function readInviteCookie(
  raw: string | undefined | null,
): Promise<{ codeId: string; exp: number } | null> {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [codeId, expStr, sigB64] = parts;
  let providedSig: Uint8Array;
  try {
    providedSig = base64UrlToBytes(sigB64);
  } catch {
    return null;
  }
  const expectedSig = await hmacSha256(`${codeId}.${expStr}`, getSecret());
  if (!constantTimeEqual(providedSig, expectedSig)) return null;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  return { codeId, exp };
}
