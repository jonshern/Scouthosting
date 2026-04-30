// Bearer-token auth for the mobile app + future external clients.
//
// Flow:
//   1. User signs in to the web app with Lucia (cookie session).
//   2. Mobile app deep-links into /api/v1/auth/token; the route verifies
//      the Lucia cookie, then calls issueToken(userId, deviceLabel) to
//      mint a fresh raw token. The raw value is shown to the caller
//      EXACTLY ONCE in the JSON response.
//   3. Mobile app stores the raw token in secure storage (Keychain on
//      iOS, EncryptedSharedPreferences on Android) and sends it on every
//      subsequent request as `Authorization: Bearer <raw>`.
//   4. Server's auth middleware calls verifyToken(rawHeader) → userId
//      or null.
//
// We never store the raw token. Only its sha256 hash. This is the same
// pattern used by GitHub PATs / Stripe API keys — if our DB leaks, the
// tokens are useless without the original raw value.

import crypto from "node:crypto";

/* ------------------------------------------------------------------ */
/* Hashing                                                             */
/* ------------------------------------------------------------------ */

const TOKEN_BYTES = 32; // 256 bits of entropy
const TOKEN_PREFIX = "compass_pat_";

/** Generate a cryptographically random raw token. */
export function generateRawToken() {
  return TOKEN_PREFIX + crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

/** SHA-256 of the raw token. The DB stores this; the wire carries the raw. */
export function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

/* ------------------------------------------------------------------ */
/* Issue + verify                                                      */
/* ------------------------------------------------------------------ */

/**
 * Mint a fresh token for a user. Returns { id, raw, name } — `raw` is the
 * value the caller must hand to the client; the server never sees it
 * again after this call.
 *
 * @param {string} userId
 * @param {string} name      Human-readable label, e.g. "Mason's iPhone"
 * @param {Object} prismaClient
 * @returns {Promise<{ id: string, raw: string, name: string, createdAt: Date }>}
 */
export async function issueToken(userId, name, prismaClient) {
  if (!userId) throw new Error("issueToken: missing userId");
  if (!name || !String(name).trim()) throw new Error("issueToken: missing name");
  if (!prismaClient) throw new Error("issueToken: missing prismaClient");

  const raw = generateRawToken();
  const tokenHash = hashToken(raw);
  const trimmed = String(name).trim().slice(0, 80);

  const row = await prismaClient.apiToken.create({
    data: { userId, name: trimmed, tokenHash },
  });

  return { id: row.id, raw, name: row.name, createdAt: row.createdAt };
}

/**
 * Look up a raw bearer token. Returns the userId on success or null on
 * miss / revoked. Constant-time-equal of the hash isn't strictly needed
 * because we look the hash up by primary key, not by streaming compare —
 * but we still avoid leaking timing about the user existing vs. the
 * token being revoked by collapsing both into "null".
 *
 * @param {string|null} authorizationHeader  The raw Authorization header value.
 * @param {Object} prismaClient
 * @returns {Promise<{ userId: string, tokenId: string } | null>}
 */
export async function verifyToken(authorizationHeader, prismaClient) {
  if (!authorizationHeader) return null;
  if (!prismaClient) throw new Error("verifyToken: missing prismaClient");

  const m = String(authorizationHeader).match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const raw = m[1];
  if (!raw.startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = hashToken(raw);
  const row = await prismaClient.apiToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, revokedAt: true },
  });
  if (!row || row.revokedAt) return null;

  // Best-effort lastUsedAt update — we don't await it on the request hot
  // path because it's only a metric. Errors are swallowed.
  prismaClient.apiToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: row.userId, tokenId: row.id };
}

/** Revoke (soft-delete) a token. Idempotent. */
export async function revokeToken(tokenId, prismaClient) {
  if (!tokenId || !prismaClient) return;
  await prismaClient.apiToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
}

export const _internal = {
  TOKEN_PREFIX,
  TOKEN_BYTES,
};
