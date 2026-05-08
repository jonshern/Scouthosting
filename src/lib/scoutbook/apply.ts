// Apply parsed Scoutbook rows to the local cache. Pure function:
// resolves Members by scoutbookUserId, upserts ScoutbookProfile + the
// related ScoutbookMeritBadge / ScoutbookAward collections. The call
// site wraps this in a sync run row so we have an audit trail.

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ParsedScoutbookRow } from "./csv";

export type ApplyResult = {
  rowsSeen: number;
  rowsApplied: number;
  meritBadgesUpserted: number;
  awardsUpserted: number;
  warnings: string[];
  unmatched: { scoutbookUserId: string; firstName?: string; lastName?: string }[];
};

export async function applyAdvancementRows(args: {
  orgId: string;
  rows: ParsedScoutbookRow[];
}): Promise<ApplyResult> {
  const warnings: string[] = [];
  const unmatched: ApplyResult["unmatched"] = [];
  let applied = 0;
  let mbUpserts = 0;
  let awardUpserts = 0;

  const sbIds = [...new Set(args.rows.map((r) => r.scoutbookUserId))];
  const members = await prisma.member.findMany({
    where: {
      orgId: args.orgId,
      scoutbookUserId: { in: sbIds },
      deletedAt: null,
    },
    select: { id: true, scoutbookUserId: true },
  });
  const memberBySb = new Map(
    members
      .filter((m): m is typeof m & { scoutbookUserId: string } => m.scoutbookUserId !== null)
      .map((m) => [m.scoutbookUserId, m.id]),
  );

  for (const row of args.rows) {
    const memberId = memberBySb.get(row.scoutbookUserId);
    if (!memberId) {
      unmatched.push({
        scoutbookUserId: row.scoutbookUserId,
        firstName: row.firstName,
        lastName: row.lastName,
      });
      continue;
    }

    const profile = await prisma.scoutbookProfile.upsert({
      where: { memberId },
      create: {
        orgId: args.orgId,
        memberId,
        scoutbookUserId: row.scoutbookUserId,
        rank: row.rank ?? null,
        rankAchievedAt: row.rankAchievedAt ?? null,
        serviceHours: row.serviceHours ?? 0,
        campingNights: row.campingNights ?? 0,
        hikingMiles: row.hikingMiles ?? 0,
        extras: row.raw as unknown as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
      update: {
        scoutbookUserId: row.scoutbookUserId,
        rank: row.rank ?? null,
        rankAchievedAt: row.rankAchievedAt ?? null,
        serviceHours: row.serviceHours ?? 0,
        campingNights: row.campingNights ?? 0,
        hikingMiles: row.hikingMiles ?? 0,
        extras: row.raw as unknown as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
    });
    applied += 1;

    // Merit badges — upsert by (profileId, badgeName).
    for (const mb of row.meritBadges) {
      const name = mb.badgeName.trim();
      if (!name) continue;
      await prisma.scoutbookMeritBadge.upsert({
        where: {
          profileId_badgeName: { profileId: profile.id, badgeName: name },
        },
        create: {
          profileId: profile.id,
          badgeName: name,
          status: mb.status,
          startedAt: mb.startedAt ?? null,
          completedAt: mb.completedAt ?? null,
        },
        update: {
          status: mb.status,
          startedAt: mb.startedAt ?? null,
          completedAt: mb.completedAt ?? null,
        },
      });
      mbUpserts += 1;
    }

    // Awards — no unique constraint on the schema, so dedupe-by-name
    // via deleteMany + createMany so re-imports don't accumulate.
    if (row.awards.length > 0) {
      const names = [...new Set(row.awards.map((a) => a.awardName.trim()).filter(Boolean))];
      if (names.length > 0) {
        await prisma.scoutbookAward.deleteMany({
          where: { profileId: profile.id, awardName: { in: names } },
        });
        await prisma.scoutbookAward.createMany({
          data: row.awards
            .filter((a) => a.awardName.trim())
            .map((a) => ({
              profileId: profile.id,
              awardName: a.awardName.trim(),
              awardedAt: a.awardedAt ?? null,
            })),
        });
        awardUpserts += row.awards.length;
      }
    }
  }
  return {
    rowsSeen: args.rows.length,
    rowsApplied: applied,
    meritBadgesUpserted: mbUpserts,
    awardsUpserted: awardUpserts,
    warnings,
    unmatched,
  };
}

export type _PrismaClientUnused = PrismaClient;
