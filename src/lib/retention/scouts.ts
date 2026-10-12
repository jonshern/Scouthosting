// Youth record retention. Policy (agreed by the project owner,
// 2026-10-11): a scout's records are kept until 18 months after the
// scout turns 18 or leaves the unit, whichever comes first, then
// deleted. Venturing crews and Sea Scout ships keep youth to 21, so
// for those units the age clock starts at 21 instead.
//
// "Records" means the Member row (encrypted PII, and everything that
// cascades from it: permission slips (an audit row without personal
// details records that each slip existed), trainings, position terms, loans,
// sales links, subaccount), RSVPs and sign-up claims, and, when the
// scout has their own login in this unit, their chat messages,
// reactions, uploaded photos (database rows and stored files), channel
// seats and unit membership. A scout login left with no unit at all is
// deleted too. Ledger transactions survive with the member link nulled
// (the unit's books must still balance).
//
// Called nightly from runCronTick; Waypoint's cron calls the same
// function.

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { logger } from "@/lib/log";
import * as storage from "@/lib/storage";

const log = logger.child("retention");

export const RETENTION_MONTHS = 18;
const ADULT_AGE = 18;
// Venturing and Sea Scouts: youth until 21.
const OLDER_YOUTH_UNITS = ["Crew", "Ship"] as const;
const OLDER_YOUTH_AGE = 21;
const BATCH = 200;

function monthsBefore(d: Date, months: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() - months);
  return out;
}

export function retentionCutoffs(now: Date) {
  const left = monthsBefore(now, RETENTION_MONTHS);
  return {
    // Left the unit before this moment.
    left,
    // Born before this moment: turned 18 more than 18 months ago.
    bornAdult: monthsBefore(left, ADULT_AGE * 12),
    bornOlderYouth: monthsBefore(left, OLDER_YOUTH_AGE * 12),
  };
}

// Pure version of the query below, for tests and for the admin UI.
export function scoutRecordsExpired(
  m: { isYouth: boolean; birthdate: Date | null; leftAt: Date | null; deletedAt?: Date | null },
  unitType: string,
  now: Date,
): boolean {
  if (!m.isYouth) return false;
  const c = retentionCutoffs(now);
  if (m.leftAt && m.leftAt < c.left) return true;
  if (!m.birthdate) return false;
  const bornBefore = (OLDER_YOUTH_UNITS as readonly string[]).includes(unitType)
    ? c.bornOlderYouth
    : c.bornAdult;
  return m.birthdate < bornBefore;
}

// leftAt bookkeeping for writes that change Member.status.
export function leftAtFor(
  prev: { status: string; leftAt: Date | null } | null,
  nextStatus: string,
  now: Date = new Date(),
): Date | null {
  if (nextStatus !== "alumni") return null;
  if (prev?.status === "alumni" && prev.leftAt) return prev.leftAt;
  return now;
}

export async function purgeExpiredScoutRecords(
  // orgId limits the sweep to one unit (tests, or a per-unit run).
  opts: { now?: Date; prismaClient?: PrismaClient; orgId?: string } = {},
): Promise<{ purged: number; failed: number }> {
  const now = opts.now ?? new Date();
  const db = opts.prismaClient ?? defaultPrisma;
  const c = retentionCutoffs(now);

  const due = await db.member.findMany({
    where: {
      ...(opts.orgId ? { orgId: opts.orgId } : {}),
      isYouth: true,
      // Trashed rows are already handled by the 30-day trash purge.
      deletedAt: null,
      OR: [
        { leftAt: { lt: c.left } },
        { birthdate: { lt: c.bornOlderYouth } },
        { birthdate: { lt: c.bornAdult }, org: { unitType: { notIn: [...OLDER_YOUTH_UNITS] } } },
      ],
    },
    select: { id: true, orgId: true, email: true },
    take: BATCH,
  });

  let purged = 0;
  let failed = 0;
  for (const m of due) {
    try {
      await purgeOne(db, m);
      purged++;
    } catch (err) {
      failed++;
      log.warn("scout retention purge failed", {
        memberId: m.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { purged, failed };
}

async function purgeOne(
  db: PrismaClient,
  m: { id: string; orgId: string; email: string | null },
): Promise<void> {
  const email = m.email?.trim().toLowerCase() || null;

  // The scout's own login in this unit, if any. Only a scout-role
  // membership counts: a parent sharing the family email keeps theirs.
  const login = email
    ? await db.orgMembership.findFirst({
        where: { orgId: m.orgId, role: "scout", user: { email: { equals: email, mode: "insensitive" } } },
        select: { userId: true },
      })
    : null;
  const userId = login?.userId ?? null;

  // RSVPs and slot sign-ups made without a login carry only an email.
  // Families often share one address, so match by email only when no
  // one else in the unit uses it; otherwise a parent's or sibling's
  // sign-ups would go with the scout.
  const emailIsTheScouts =
    !!email &&
    (await db.member.count({
      where: { orgId: m.orgId, id: { not: m.id }, email: { equals: email, mode: "insensitive" } },
    })) === 0 &&
    (await db.orgMembership.count({
      where: { orgId: m.orgId, role: { not: "scout" }, user: { email: { equals: email, mode: "insensitive" } } },
    })) === 0;
  const byEmail = emailIsTheScouts ? [{ email }] : [];

  const orgChannel = { channel: { orgId: m.orgId } };
  const photos = userId
    ? await db.photo.findMany({
        where: {
          orgId: m.orgId,
          OR: [{ uploaderUserId: userId }, { message: { authorId: userId, ...orgChannel } }],
        },
        select: { id: true, filename: true },
      })
    : [];

  await db.$transaction(async (tx) => {
    if (photos.length) {
      await tx.photo.deleteMany({ where: { id: { in: photos.map((p) => p.id) } } });
    }
    if (userId) {
      await tx.reaction.deleteMany({ where: { userId, message: orgChannel } });
      await tx.message.deleteMany({ where: { authorId: userId, ...orgChannel } });
      await tx.channelMember.deleteMany({ where: { userId, ...orgChannel } });
      await tx.orgMembership.deleteMany({ where: { userId, orgId: m.orgId, role: "scout" } });
    }
    const who = [{ memberId: m.id }, ...(userId ? [{ userId }] : []), ...byEmail];
    await tx.rsvp.deleteMany({ where: { orgId: m.orgId, OR: who } });
    const slotWho = [...(userId ? [{ userId }] : []), ...byEmail];
    if (slotWho.length) await tx.slotAssignment.deleteMany({ where: { orgId: m.orgId, OR: slotWho } });
    // Signed slips go with the scout, but leave a trace that consent
    // existed: event, signing time, signer role. No names or emails.
    const slips = await tx.permissionSlip.findMany({
      where: { memberId: m.id },
      select: { id: true, eventId: true, signedAt: true },
    });
    await tx.auditLog.createMany({
      data: [
        {
          orgId: m.orgId,
          entityType: "Member",
          entityId: m.id,
          action: "retention-delete",
          summary: "Scout record deleted under the retention policy",
        },
        ...slips.map((s) => ({
          orgId: m.orgId,
          entityType: "PermissionSlip",
          entityId: s.id,
          action: "retention-delete",
          summary: `Signed by parent/guardian for event ${s.eventId} at ${s.signedAt.toISOString()}`,
        })),
      ],
    });
    await tx.member.delete({ where: { id: m.id } });
  });

  // A scout login that no longer belongs to any unit goes too.
  if (userId) {
    const remaining = await db.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true, _count: { select: { memberships: true, ownedOrgs: true } } },
    });
    if (
      remaining &&
      !remaining.isSuperAdmin &&
      remaining._count.memberships === 0 &&
      remaining._count.ownedOrgs === 0
    ) {
      await db.user.delete({ where: { id: userId } });
    }
  }

  // Stored files last: a failed delete leaves an unreachable object,
  // never a database row pointing at nothing.
  for (const p of photos) {
    try {
      await storage.del(p.filename);
    } catch (err) {
      log.warn("photo file delete failed", {
        key: p.filename,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
