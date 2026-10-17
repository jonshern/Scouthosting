// Lantern journey: the DB side of /api/v1/journey/*. Every function
// takes the signed-in user and only ever touches that user's scouts;
// someone else's scout id is a 404.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, notFound } from "@/lib/api/v1";
import { decryptField, unwrapDekWithMaster } from "@/lib/encryption";
import { lastInitial } from "@/lib/counselor/ids";
import { decryptScoutName, encryptScoutName } from "./crypto";
import { MAX_SCOUTS_PER_OWNER, lastChangePerKey, type ProgressChangeT } from "./schema";

type Owner = { id: string; email: string };

const SCOUT_SELECT = {
  id: true,
  ownerUserId: true,
  encName: true,
  path: true,
  custom: true,
  memberId: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ScoutRow = Prisma.JourneyScoutGetPayload<{ select: typeof SCOUT_SELECT }>;

export type TroopScout = {
  memberId: string;
  firstName: string;
  lastInitial: string;
  orgName: string;
  orgSlug: string;
};

/**
 * Youth roster entries, in any unit, that list this user as a parent:
 * a parent Member with the user's email is in the scout's parentIds.
 * Only for users who confirmed their email, so nobody gets another
 * family's troop records by signing up with their address.
 */
export async function troopScoutsFor(user: Owner): Promise<TroopScout[]> {
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } });
  if (!u?.emailVerified) return [];
  const parents = await prisma.member.findMany({
    where: { email: { equals: user.email, mode: "insensitive" }, deletedAt: null },
    select: { id: true, orgId: true },
  });
  if (!parents.length) return [];
  const kids = await prisma.member.findMany({
    where: {
      isYouth: true,
      deletedAt: null,
      OR: parents.map((p) => ({ orgId: p.orgId, parentIds: { has: p.id } })),
    },
    select: {
      id: true,
      orgId: true,
      encFirstName: true,
      encLastName: true,
      org: { select: { slug: true, displayName: true, encryptedDek: true } },
    },
  });
  const out: TroopScout[] = [];
  for (const k of kids) {
    if (!k.org.encryptedDek) continue;
    const dek = unwrapDekWithMaster(k.org);
    out.push({
      memberId: k.id,
      firstName: decryptField(k.encFirstName, dek, k.orgId, "member.firstName") ?? "",
      lastInitial: lastInitial(decryptField(k.encLastName, dek, k.orgId, "member.lastName") ?? ""),
      orgName: k.org.displayName,
      orgSlug: k.org.slug,
    });
  }
  return out.sort((a, b) => a.firstName.localeCompare(b.firstName));
}

async function troopView(user: Owner, memberId: string | null) {
  if (!memberId) return null;
  const linked = (await troopScoutsFor(user)).find((s) => s.memberId === memberId);
  if (!linked) return null;
  const rows = await prisma.requirementProgress.findMany({
    where: { memberId, status: "signed_off" },
    select: { requirementId: true, signedOffAt: true },
  });
  const signedOff: Record<string, string | true> = {};
  for (const r of rows) signedOff[r.requirementId] = r.signedOffAt ? r.signedOffAt.toISOString().slice(0, 10) : true;
  return { ...linked, signedOff };
}

function summary(row: ScoutRow) {
  return {
    id: row.id,
    name: decryptScoutName(row.ownerUserId, row.encName),
    linked: !!row.memberId,
    updatedAt: row.updatedAt,
  };
}

async function full(user: Owner, row: ScoutRow) {
  const progressRows = await prisma.journeyProgress.findMany({
    where: { scoutId: row.id },
    select: { key: true, doneOn: true, byScout: true },
    orderBy: { key: "asc" },
  });
  const progress: Record<string, string | true> = {};
  // Steps the scout checked on their own device; the rest were checked by the parent.
  const checkedBy: Record<string, "scout"> = {};
  for (const p of progressRows) {
    progress[p.key] = p.doneOn ?? true;
    if (p.byScout) checkedBy[p.key] = "scout";
  }
  return {
    ...summary(row),
    path: row.path as string[],
    custom: row.custom as Record<string, unknown>,
    progress,
    checkedBy,
    troop: await troopView(user, row.memberId),
  };
}

export async function listScouts(user: Owner) {
  const rows = await prisma.journeyScout.findMany({
    where: { ownerUserId: user.id },
    select: SCOUT_SELECT,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(summary);
}

async function owned(user: Owner, id: string): Promise<ScoutRow> {
  const row = await prisma.journeyScout.findFirst({ where: { id, ownerUserId: user.id }, select: SCOUT_SELECT });
  if (!row) throw notFound();
  return row;
}

export async function getScout(user: Owner, id: string) {
  return full(user, await owned(user, id));
}

export async function createScout(
  user: Owner,
  body: { name: string; path?: string[]; custom?: Record<string, unknown>; progress?: Record<string, string | true> },
) {
  const row = await prisma.$transaction(async (tx) => {
    // Serialize creates per owner so the cap holds under concurrent requests.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`journey-owner:${user.id}`}))`;
    const count = await tx.journeyScout.count({ where: { ownerUserId: user.id } });
    if (count >= MAX_SCOUTS_PER_OWNER) throw new ApiError(409, "too_many_scouts");
    const scout = await tx.journeyScout.create({
      data: {
        ownerUserId: user.id,
        encName: encryptScoutName(user.id, body.name),
        path: body.path ?? [],
        custom: (body.custom ?? {}) as Prisma.InputJsonValue,
      },
      select: SCOUT_SELECT,
    });
    const progress = Object.entries(body.progress ?? {});
    if (progress.length) {
      await tx.journeyProgress.createMany({
        data: progress.map(([key, on]) => ({ scoutId: scout.id, key, doneOn: on === true ? null : on })),
      });
    }
    return scout;
  });
  return full(user, row);
}

export async function updateScout(
  user: Owner,
  id: string,
  body: { name?: string; path?: string[]; custom?: Record<string, unknown>; memberId?: string | null },
) {
  const row = await owned(user, id);
  if (body.memberId) {
    const mine = await troopScoutsFor(user);
    if (!mine.some((s) => s.memberId === body.memberId)) throw new ApiError(403, "forbidden", { reason: "not_your_scout" });
  }
  const updated = await prisma.journeyScout.update({
    where: { id: row.id },
    data: {
      ...(body.name !== undefined ? { encName: encryptScoutName(user.id, body.name) } : {}),
      ...(body.path !== undefined ? { path: body.path } : {}),
      ...(body.custom !== undefined ? { custom: body.custom as Prisma.InputJsonValue } : {}),
      ...(body.memberId !== undefined ? { memberId: body.memberId } : {}),
    },
    select: SCOUT_SELECT,
  });
  return full(user, updated);
}

export async function deleteScout(user: Owner, id: string) {
  const row = await owned(user, id);
  await prisma.journeyScout.delete({ where: { id: row.id } });
}

/** Checks and unchecks steps; the last change per key in the batch wins. */
export async function applyProgress(user: Owner, id: string, changes: ProgressChangeT[]) {
  const row = await owned(user, id);
  await applyChanges(row.id, changes, false);
  return full(user, await owned(user, id));
}

async function applyChanges(scoutId: string, changes: ProgressChangeT[], byScout: boolean) {
  const final = lastChangePerKey(changes);
  const off = final.filter((c) => !c.done).map((c) => c.key);
  const on = final.filter((c) => c.done);
  await prisma.$transaction(async (tx) => {
    if (off.length) await tx.journeyProgress.deleteMany({ where: { scoutId, key: { in: off } } });
    for (const c of on) {
      await tx.journeyProgress.upsert({
        where: { scoutId_key: { scoutId, key: c.key } },
        create: { scoutId, key: c.key, doneOn: c.on ?? null, byScout },
        // Re-checking something already checked keeps the first day (and who) unless a day is given.
        update: c.on ? { doneOn: c.on, byScout } : {},
      });
    }
    await tx.journeyScout.update({ where: { id: scoutId }, data: { updatedAt: new Date() } });
  });
}

// ---------------------------------------------------------------------
// The scout's own device (./devices.ts verifies the token). It sees one
// trail, through the owner's eyes for troop sign-offs, and can only
// check and uncheck steps.

async function ownerOf(row: ScoutRow): Promise<Owner> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: row.ownerUserId }, select: { id: true, email: true } });
  return u;
}

async function byId(id: string): Promise<ScoutRow> {
  const row = await prisma.journeyScout.findUnique({ where: { id }, select: SCOUT_SELECT });
  if (!row) throw notFound();
  return row;
}

export async function getScoutAsScout(scoutId: string) {
  const row = await byId(scoutId);
  return full(await ownerOf(row), row);
}

export async function applyProgressAsScout(scoutId: string, changes: ProgressChangeT[]) {
  await applyChanges(scoutId, changes, true);
  return getScoutAsScout(scoutId);
}

/** For the parent: makes sure the scout is theirs (404 otherwise). */
export async function requireOwned(user: Owner, id: string) {
  await owned(user, id);
}
