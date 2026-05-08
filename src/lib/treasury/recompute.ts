// Cached-balance validator. Recomputes Fund.balanceCents and
// MemberSubaccount.balanceCents from scratch and reports drift.
// Wired up by the nightly job (and surfaced by a button on the
// /admin/treasury overview page).

import { prisma } from "@/lib/db";
import { SCOUT_ACCOUNTS } from "./money";

export type DriftReport = {
  funds: { fundId: string; code: string; cached: number; actual: number }[];
  members: { memberId: string; cached: number; actual: number }[];
  fixed: boolean;
};

export async function recomputeOrgBalances(
  orgId: string,
  opts: { fix?: boolean } = {},
): Promise<DriftReport> {
  const funds = await prisma.fund.findMany({ where: { orgId } });
  const fundDrift: DriftReport["funds"] = [];
  for (const f of funds) {
    const sum = await prisma.transaction.aggregate({
      where: { orgId, fundId: f.id },
      _sum: { amountCents: true },
    });
    const actual = sum._sum.amountCents ?? 0;
    if (actual !== f.balanceCents) {
      fundDrift.push({ fundId: f.id, code: f.code, cached: f.balanceCents, actual });
      if (opts.fix) {
        await prisma.fund.update({
          where: { id: f.id },
          data: { balanceCents: actual },
        });
      }
    }
  }

  const scoutAccountsFund = funds.find((f) => f.code === SCOUT_ACCOUNTS);
  const memberDrift: DriftReport["members"] = [];
  if (scoutAccountsFund) {
    const subs = await prisma.memberSubaccount.findMany({ where: { orgId } });
    for (const s of subs) {
      const sum = await prisma.transaction.aggregate({
        where: { orgId, memberId: s.memberId, fundId: scoutAccountsFund.id },
        _sum: { amountCents: true },
      });
      const actual = sum._sum.amountCents ?? 0;
      if (actual !== s.balanceCents) {
        memberDrift.push({ memberId: s.memberId, cached: s.balanceCents, actual });
        if (opts.fix) {
          await prisma.memberSubaccount.update({
            where: { id: s.id },
            data: { balanceCents: actual },
          });
        }
      }
    }
  }

  return { funds: fundDrift, members: memberDrift, fixed: !!opts.fix };
}
