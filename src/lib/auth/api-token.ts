// Bearer-token auth for the mobile app + future external clients.
//
// Flow:
//   1. User signs in to web (Better Auth cookie session).
//   2. Mobile app deep-links into /api/v1/auth/token; the route
//      verifies the cookie session, calls issueToken(userId, name),
//      shows the raw value to the caller EXACTLY ONCE.
//   3. Mobile stores raw in secure storage and sends it as
//      `Authorization: Bearer <raw>`.
//   4. verifyToken(authHeader) -> { userId, tokenId } or null.
//
// We never store the raw token; only its sha256 hash. Same pattern
// as GitHub PATs / Stripe API keys.

import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const TOKEN_BYTES = 32;
const TOKEN_PREFIX = "compass_pat_";
// Tokens expire; the phone signs in again after this.
export const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function generateRawToken(): string {
  return TOKEN_PREFIX + crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

export async function issueToken(
  userId: string,
  name: string,
  prismaClient: PrismaClient,
  ttlMs: number = TOKEN_TTL_MS,
): Promise<{ id: string; raw: string; name: string; createdAt: Date; expiresAt: Date }> {
  if (!userId) throw new Error("issueToken: missing userId");
  if (!name || !String(name).trim()) throw new Error("issueToken: missing name");
  if (!prismaClient) throw new Error("issueToken: missing prismaClient");

  const raw = generateRawToken();
  const tokenHash = hashToken(raw);
  const trimmed = String(name).trim().slice(0, 80);

  const row = await prismaClient.apiToken.create({
    data: { userId, name: trimmed, tokenHash, expiresAt: new Date(Date.now() + ttlMs) },
  });

  return { id: row.id, raw, name: row.name, createdAt: row.createdAt, expiresAt: row.expiresAt! };
}

export async function verifyToken(
  authorizationHeader: string | null | undefined,
  prismaClient: PrismaClient,
): Promise<{ userId: string; tokenId: string } | null> {
  if (!authorizationHeader) return null;
  if (!prismaClient) throw new Error("verifyToken: missing prismaClient");

  const m = String(authorizationHeader).match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const raw = m[1];
  if (!raw.startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = hashToken(raw);
  const row = await prismaClient.apiToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, revokedAt: true, expiresAt: true },
  });
  if (!row || row.revokedAt) return null;
  if (!row.expiresAt || row.expiresAt.getTime() <= Date.now()) return null;

  prismaClient.apiToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: row.userId, tokenId: row.id };
}

export async function revokeToken(
  tokenId: string,
  prismaClient: PrismaClient,
): Promise<void> {
  if (!tokenId || !prismaClient) return;
  await prismaClient.apiToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
}

// Every token the user holds stops working, e.g. after a password change.
export async function revokeAllTokensForUser(
  userId: string,
  prismaClient: PrismaClient,
): Promise<number> {
  const res = await prismaClient.apiToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count;
}

export const _internal = { TOKEN_PREFIX, TOKEN_BYTES };
