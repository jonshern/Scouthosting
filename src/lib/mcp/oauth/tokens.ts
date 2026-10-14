// Authorization codes, access tokens and refresh tokens for the Claude
// connector. Only sha256 hashes are stored (same as API tokens in
// lib/auth/api-token.ts).
//
//   code     single use, five minutes, PKCE S256 required. A code used
//            twice revokes the tokens it minted (OAuth 2.1 §4.1.3).
//   access   one hour, bound to this server's /mcp resource.
//   refresh  30 days, rotated on every use. Presenting a refresh token
//            that was already rotated revokes its whole family, since
//            that means a copy leaked.

import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import {
  ACCESS_TOKEN_TTL_MS,
  AUTH_CODE_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  resourceUrl,
} from "@/lib/mcp/config";

export const CODE_PREFIX = "compass_mcp_code_";
export const ACCESS_PREFIX = "compass_mcp_at_";
export const REFRESH_PREFIX = "compass_mcp_rt_";

const random = (prefix: string) => prefix + crypto.randomBytes(32).toString("base64url");
export const sha256 = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) === challenge. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const computed = crypto.createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const validChallenge = (c: string | null | undefined): c is string => !!c && /^[A-Za-z0-9\-_]{43}$/.test(c);

export async function issueCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}): Promise<string> {
  const raw = random(CODE_PREFIX);
  await prisma.mcpAuthCode.create({
    data: {
      codeHash: sha256(raw),
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      scope: input.scope,
      resource: resourceUrl(),
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  });
  return raw;
}

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export type GrantError = { error: "invalid_grant" | "invalid_request" | "invalid_target"; error_description: string };

async function mint(familyId: string, clientId: string, userId: string, scope: string): Promise<TokenResponse> {
  const access = random(ACCESS_PREFIX);
  const refresh = random(REFRESH_PREFIX);
  const now = Date.now();
  await prisma.mcpToken.create({
    data: {
      familyId,
      clientId,
      userId,
      scope,
      resource: resourceUrl(),
      accessHash: sha256(access),
      refreshHash: sha256(refresh),
      accessExpiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    },
  });
  await prisma.mcpClient.update({ where: { clientId }, data: { lastUsedAt: new Date(now) } }).catch(() => {});
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refresh,
    scope,
  };
}

const revokeFamily = (familyId: string) =>
  prisma.mcpToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });

export async function exchangeCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenResponse | GrantError> {
  const invalid = (d: string): GrantError => ({ error: "invalid_grant", error_description: d });
  if (!input.code.startsWith(CODE_PREFIX)) return invalid("Unknown code");
  const row = await prisma.mcpAuthCode.findUnique({ where: { codeHash: sha256(input.code) } });
  if (!row) return invalid("Unknown code");
  if (row.clientId !== input.clientId) return invalid("Code was issued to another client");

  // Claim the code atomically so two racing exchanges can't both win.
  const claimed = await prisma.mcpAuthCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) {
    if (row.familyId) await revokeFamily(row.familyId);
    return invalid("Code already used");
  }
  if (row.expiresAt.getTime() <= Date.now()) return invalid("Code expired");
  if (row.redirectUri !== input.redirectUri) return invalid("redirect_uri does not match");
  if (!pkceMatches(input.codeVerifier, row.codeChallenge)) return invalid("PKCE verification failed");
  if (row.resource !== resourceUrl()) return { error: "invalid_target", error_description: "Code is for another resource" };

  const familyId = crypto.randomUUID();
  await prisma.mcpAuthCode.update({ where: { id: row.id }, data: { familyId } });
  return mint(familyId, row.clientId, row.userId, row.scope);
}

export async function refresh(input: { refreshToken: string; clientId: string; scope?: string | null }): Promise<TokenResponse | GrantError> {
  const invalid = (d: string): GrantError => ({ error: "invalid_grant", error_description: d });
  if (!input.refreshToken.startsWith(REFRESH_PREFIX)) return invalid("Unknown refresh token");
  const row = await prisma.mcpToken.findUnique({ where: { refreshHash: sha256(input.refreshToken) } });
  if (!row) return invalid("Unknown refresh token");
  if (row.clientId !== input.clientId) return invalid("Token was issued to another client");
  if (row.revokedAt && row.rotatedAt) {
    // A rotated token came back: someone else holds a copy.
    await revokeFamily(row.familyId);
    return invalid("Refresh token already used");
  }
  if (row.revokedAt) return invalid("Refresh token revoked");
  if (row.refreshExpiresAt.getTime() <= Date.now()) return invalid("Refresh token expired");
  if (row.resource !== resourceUrl()) return { error: "invalid_target", error_description: "Token is for another resource" };

  // A refresh may narrow the scope, never widen it.
  let scope = row.scope;
  if (input.scope) {
    const had = new Set(row.scope.split(" "));
    const asked = input.scope.split(/\s+/).filter((s) => s && s !== "offline_access");
    if (asked.some((s) => !had.has(s))) return { error: "invalid_request", error_description: "Scope exceeds the original grant" } as GrantError;
    if (asked.length) scope = asked.join(" ");
  }

  const now = new Date();
  const claimed = await prisma.mcpToken.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: now, rotatedAt: now },
  });
  if (claimed.count === 0) {
    await revokeFamily(row.familyId);
    return invalid("Refresh token already used");
  }
  return mint(row.familyId, row.clientId, row.userId, scope);
}

export type VerifiedAccess = { tokenId: string; userId: string; clientId: string; scopes: string[]; expiresAt: Date };

export async function verifyAccessToken(authorization: string | null | undefined): Promise<VerifiedAccess | null> {
  const m = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!m || !m[1].startsWith(ACCESS_PREFIX)) return null;
  const row = await prisma.mcpToken.findUnique({ where: { accessHash: sha256(m[1]) } });
  if (!row || row.revokedAt) return null;
  if (row.accessExpiresAt.getTime() <= Date.now()) return null;
  if (row.resource !== resourceUrl()) return null;
  prisma.mcpToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return {
    tokenId: row.id,
    userId: row.userId,
    clientId: row.clientId,
    scopes: row.scope.split(" "),
    expiresAt: row.accessExpiresAt,
  };
}

/** RFC 7009: revoke by access or refresh token. Unknown tokens are not an error. */
export async function revokeByToken(raw: string, clientId?: string | null): Promise<void> {
  const hash = sha256(raw);
  const row = await prisma.mcpToken.findFirst({ where: { OR: [{ accessHash: hash }, { refreshHash: hash }] } });
  if (!row) return;
  if (clientId && row.clientId !== clientId) return;
  await revokeFamily(row.familyId);
}

/** Disconnect every Claude connection a user has, e.g. after a password change. */
export async function revokeAllMcpTokensForUser(userId: string): Promise<number> {
  const r = await prisma.mcpToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count;
}

/** The apps this adult has connected (one row per app), for the account page. */
export async function connectionsFor(userId: string) {
  const rows = await prisma.mcpToken.findMany({
    where: { userId, revokedAt: null, refreshExpiresAt: { gt: new Date() } },
    select: { clientId: true, createdAt: true, lastUsedAt: true },
  });
  if (!rows.length) return [];
  const clients = await prisma.mcpClient.findMany({
    where: { clientId: { in: [...new Set(rows.map((r) => r.clientId))] } },
    select: { clientId: true, clientName: true },
  });
  return clients
    .map((c) => {
      const mine = rows.filter((r) => r.clientId === c.clientId);
      const used = mine.map((r) => r.lastUsedAt ?? r.createdAt).sort((a, b) => b.getTime() - a.getTime());
      return { clientId: c.clientId, name: c.clientName, connectedAt: mine.map((r) => r.createdAt).sort((a, b) => a.getTime() - b.getTime())[0], lastUsedAt: used[0] };
    })
    .sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime());
}

/** Disconnect one app for this adult. */
export async function revokeClientForUser(userId: string, clientId: string): Promise<number> {
  const r = await prisma.mcpToken.updateMany({ where: { userId, clientId, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count;
}
