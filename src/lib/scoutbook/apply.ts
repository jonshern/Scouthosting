// Apply parsed Scoutbook rows to the local cache. Pure function:
// resolves Members by scoutbookUserId, upserts ScoutbookProfile + the
// related collections. The call site wraps this in a sync run row so
// we have an audit trail.

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ParsedScoutbookRow } from "./csv";

export type ApplyResult = {
  rowsSeen: number;
  rowsApplied: number;
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

  // Build sbUserId → memberId map up front.
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
    await prisma.scoutbookProfile.upsert({
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
  }
  return { rowsSeen: args.rows.length, rowsApplied: applied, warnings, unmatched };
}

export type _PrismaClientUnused = PrismaClient;
