// Generic signed-token helper. HMAC-SHA256 over a JSON payload; the
// token itself is `base64url(payload).base64url(sig)`.
//
// Stateless (no DB row). For flows where one-time use matters
// (password reset, magic link), the consumer's invariant should make
// replay a no-op — e.g. password-reset rotates the password's salt so
// old reset tokens become semantically meaningless after the user
// picks a new password.

import crypto from "node:crypto";

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

export type SignedTokenClaims = Record<string, unknown> & { exp?: number };

export function makeSignedToken(
  claims: Record<string, unknown>,
  opts: { secret: string; ttlSeconds: number },
): string {
  if (!opts.secret) throw new Error("secret required");
  const payload = {
    ...claims,
    exp: Math.floor(Date.now() / 1000) + opts.ttlSeconds,
  };
  const buf = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = crypto.createHmac("sha256", opts.secret).update(buf).digest();
  return `${b64u(buf)}.${b64u(sig)}`;
}

export function verifySignedToken<T extends SignedTokenClaims = SignedTokenClaims>(
  token: string | null | undefined,
  opts: { secret: string },
): T | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [pBuf, sBuf] = token.split(".");
  let payloadBuf: Buffer;
  let sigBuf: Buffer;
  try {
    payloadBuf = b64uDecode(pBuf);
    sigBuf = b64uDecode(sBuf);
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", opts.secret).update(payloadBuf).digest();
  if (sigBuf.length !== expected.length || !crypto.timingSafeEqual(sigBuf, expected)) {
    return null;
  }
  let claims: T;
  try {
    claims = JSON.parse(payloadBuf.toString("utf8")) as T;
  } catch {
    return null;
  }
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return claims;
}
