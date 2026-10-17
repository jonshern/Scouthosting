// A scout's own device in Lantern (JourneyScoutDevice). Scouts never get
// an account: the parent makes a one-time code, enters it on the scout's
// device, and that device gets a token for that one scout's trail.
//
// Codes: 8 characters from an alphabet without look-alikes (no 0/O,
// 1/I/L), shown as ABCD-EFGH, valid 15 minutes, single use, one live code
// per scout. Tokens: "lantern_scout_" + 32 random bytes, valid 180 days,
// revocable by the parent. Only sha256 hashes of either are stored.

import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api/v1";

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_TTL_MS = 15 * 60 * 1000;
export const DEVICE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const MAX_DEVICES_PER_SCOUT = 5;
const TOKEN_PREFIX = "lantern_scout_";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** "abcd efgh", "ABCD-EFGH" → "ABCDEFGH"; null if it can't be a code. */
export function normalizeCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[\s-]/g, "");
  if (c.length !== 8) return null;
  for (const ch of c) if (!CODE_ALPHABET.includes(ch)) return null;
  return c;
}

export function newCode(): string {
  let out = "";
  // Rejection sampling keeps every character equally likely.
  while (out.length < 8) {
    const b = crypto.randomBytes(1)[0]!;
    if (b < 248) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  }
  return out;
}

export const formatCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

/** A fresh code for the scout; older unused codes stop working. */
export async function makePairCode(scoutId: string) {
  const code = newCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await prisma.$transaction([
    prisma.journeyPairCode.deleteMany({ where: { scoutId, usedAt: null } }),
    prisma.journeyPairCode.create({ data: { scoutId, codeHash: sha256(code), expiresAt } }),
  ]);
  return { code: formatCode(code), expiresAt };
}

/** Spends a code and returns a device token for its scout. */
export async function pairDevice(rawCode: string, label: string) {
  const code = normalizeCode(rawCode);
  if (!code) throw new ApiError(400, "bad_code");
  const raw = TOKEN_PREFIX + crypto.randomBytes(32).toString("hex");
  const scoutId = await prisma.$transaction(async (tx) => {
    // Claim the code atomically so two devices can't both use it.
    const claimed = await tx.journeyPairCode.updateMany({
      where: { codeHash: sha256(code), usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new ApiError(400, "bad_code");
    const row = await tx.journeyPairCode.findUniqueOrThrow({ where: { codeHash: sha256(code) }, select: { scoutId: true } });
    const live = await tx.journeyScoutDevice.count({
      where: { scoutId: row.scoutId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (live >= MAX_DEVICES_PER_SCOUT) throw new ApiError(409, "too_many_devices");
    await tx.journeyScoutDevice.create({
      data: { scoutId: row.scoutId, tokenHash: sha256(raw), label, expiresAt: new Date(Date.now() + DEVICE_TTL_MS) },
    });
    return row.scoutId;
  });
  return { token: raw, scoutId };
}

export type ScoutDevice = { deviceId: string; scoutId: string };

/** The device behind `Authorization: Bearer lantern_scout_…`, or 401. */
export async function requireScoutDevice(req: NextRequest): Promise<ScoutDevice> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  const raw = m?.[1];
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) throw new ApiError(401, "unauthorized");
  const row = await prisma.journeyScoutDevice.findUnique({
    where: { tokenHash: sha256(raw) },
    select: { id: true, scoutId: true, revokedAt: true, expiresAt: true },
  });
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) throw new ApiError(401, "unauthorized");
  prisma.journeyScoutDevice.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { deviceId: row.id, scoutId: row.scoutId };
}

export async function listDevices(scoutId: string) {
  const rows = await prisma.journeyScoutDevice.findMany({
    where: { scoutId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "asc" },
  });
  return rows;
}

export async function revokeDevice(scoutId: string, deviceId: string) {
  const r = await prisma.journeyScoutDevice.updateMany({
    where: { id: deviceId, scoutId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (r.count !== 1) throw new ApiError(404, "not_found");
}
