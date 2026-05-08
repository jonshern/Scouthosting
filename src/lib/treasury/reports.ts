// Treasury reports — fund balances, account balances, budget vs.
// actual, year-over-year. Each helper returns flat rows for table
// rendering / CSV export.

import type { Org } from "@prisma/client";
import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";

export type FundBalanceRow = {
  fundId: string;
  code: string;
  name: string;
  balanceCents: number;
  fytdIncomeCents: number;
  fytdExpenseCents: number;
};

export async function fundBalancesReport(args: {
  org: Pick<Org, "id">;
  fyStart: Date;
  fyEnd: Date;
}): Promise<FundBalanceRow[]> {
  const funds = await prisma.fund.findMany({
    where: { orgId: args.org.id, archived: false },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  const ytd = await prisma.transaction.groupBy({
    by: ["fundId"],
    where: {
      orgId: args.org.id,
      postedAt: { gte: args.fyStart, lte: args.fyEnd },
    },
    _sum: { amountCents: true },
  });
  void ytd; // not used for sign-split below; use raw query instead

  // Compute income (positive) and expense (negative) totals per fund
  // for the FY window with two queries.
  const positive = await prisma.transaction.groupBy({
    by: ["fundId"],
    where: {
      orgId: args.org.id,
      postedAt: { gte: args.fyStart, lte: args.fyEnd },
      amountCents: { gt: 0 },
    },
    _sum: { amountCents: true },
  });
  const negative = await prisma.transaction.groupBy({
    by: ["fundId"],
    where: {
      orgId: args.org.id,
      postedAt: { gte: args.fyStart, lte: args.fyEnd },
      amountCents: { lt: 0 },
    },
    _sum: { amountCents: true },
  });
  const incomeBy = new Map(positive.map((p) => [p.fundId, p._sum.amountCents ?? 0]));
  const expenseBy = new Map(negative.map((p) => [p.fundId, p._sum.amountCents ?? 0]));

  return funds.map((f) => ({
    fundId: f.id,
    code: f.code,
    name: f.name,
    balanceCents: f.balanceCents,
    fytdIncomeCents: incomeBy.get(f.id) ?? 0,
    fytdExpenseCents: expenseBy.get(f.id) ?? 0,
  }));
}

export type AccountBalanceRow = {
  memberId: string;
  scoutName: string;
  patrol: string | null;
  balanceCents: number;
};

export async function accountBalancesReport(
  org: Pick<Org, "id" | "encryptedDek">,
  opts: { onlyNonZero?: boolean } = {},
): Promise<AccountBalanceRow[]> {
  if (!org.encryptedDek) return [];
  const subs = await prisma.memberSubaccount.findMany({
    where: { orgId: org.id, ...(opts.onlyNonZero ? { NOT: { balanceCents: 0 } } : {}) },
    include: { member: true },
  });
  const dek = unwrapDekWithMaster(org);
  const rows = subs.map((s) => {
    const pii = decryptMemberPii(s.member, dek, org.id);
    return {
      memberId: s.memberId,
      scoutName: `${pii.firstName} ${pii.lastName}`.trim(),
      patrol: s.member.patrol,
      balanceCents: s.balanceCents,
    };
  });
  rows.sort((a, b) => Math.abs(b.balanceCents) - Math.abs(a.balanceCents));
  return rows;
}

export type BudgetActualRow = {
  fundId: string;
  fundName: string;
  expectedCents: number;
  actualCents: number;
  notes: string | null;
};

export async function budgetVsActualReport(args: {
  org: Pick<Org, "id">;
  fiscalYearId: string;
}): Promise<BudgetActualRow[]> {
  const fy = await prisma.fiscalYear.findUnique({
    where: { id: args.fiscalYearId },
    include: { budgets: { include: { fund: true } } },
  });
  if (!fy || fy.orgId !== args.org.id) return [];
  const actuals = await prisma.transaction.groupBy({
    by: ["fundId"],
    where: {
      orgId: args.org.id,
      postedAt: { gte: fy.startsOn, lte: fy.endsOn },
    },
    _sum: { amountCents: true },
  });
  const by = new Map(actuals.map((a) => [a.fundId, a._sum.amountCents ?? 0]));
  return fy.budgets.map((b) => ({
    fundId: b.fundId,
    fundName: b.fund.name,
    expectedCents: b.expectedCents,
    actualCents: by.get(b.fundId) ?? 0,
    notes: b.notes,
  }));
}

export type YoyRow = {
  label: string;
  totalIncomeCents: number;
  totalExpenseCents: number;
  netCents: number;
};

export async function yearOverYearReport(args: {
  org: Pick<Org, "id">;
}): Promise<YoyRow[]> {
  const years = await prisma.fiscalYear.findMany({
    where: { orgId: args.org.id },
    orderBy: { startsOn: "desc" },
    take: 4,
  });
  const out: YoyRow[] = [];
  for (const fy of years) {
    const positive = await prisma.transaction.aggregate({
      where: {
        orgId: args.org.id,
        postedAt: { gte: fy.startsOn, lte: fy.endsOn },
        amountCents: { gt: 0 },
      },
      _sum: { amountCents: true },
    });
    const negative = await prisma.transaction.aggregate({
      where: {
        orgId: args.org.id,
        postedAt: { gte: fy.startsOn, lte: fy.endsOn },
        amountCents: { lt: 0 },
      },
      _sum: { amountCents: true },
    });
    const inc = positive._sum.amountCents ?? 0;
    const exp = negative._sum.amountCents ?? 0;
    out.push({
      label: fy.label,
      totalIncomeCents: inc,
      totalExpenseCents: exp,
      netCents: inc + exp,
    });
  }
  return out;
}
