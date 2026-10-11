// One-time idempotent treasury bootstrap. Creates the three system
// funds and a MemberSubaccount per active Member. Safe to call
// repeatedly; existing rows are left alone.

import { prisma } from "@/lib/db";
import {
  GENERAL_FUND,
  SCOUT_ACCOUNTS,
  STRIPE_FEES_FUND,
} from "./money";

export type ProvisionSummary = {
  fundsCreated: number;
  subaccountsCreated: number;
};

const SYSTEM_FUNDS: { code: string; name: string }[] = [
  { code: GENERAL_FUND, name: "General fund" },
  { code: SCOUT_ACCOUNTS, name: "Scout accounts" },
  { code: STRIPE_FEES_FUND, name: "Stripe processing fees" },
];

export async function provisionTreasury(orgId: string): Promise<ProvisionSummary> {
  let fundsCreated = 0;
  let subaccountsCreated = 0;

  for (const f of SYSTEM_FUNDS) {
    const existing = await prisma.fund.findUnique({
      where: { orgId_code: { orgId, code: f.code } },
    });
    if (!existing) {
      await prisma.fund.create({
        data: {
          orgId,
          code: f.code,
          name: f.name,
          isSystem: true,
        },
      });
      fundsCreated += 1;
    }
  }

  // Subaccount per active member (active or prospect; alumni do not
  // get a fresh row but their existing one is untouched).
  const members = await prisma.member.findMany({
    where: { orgId, deletedAt: null, status: { not: "alumni" } },
    select: { id: true },
  });
  for (const m of members) {
    try {
      await prisma.memberSubaccount.create({
        data: { orgId, memberId: m.id },
      });
      subaccountsCreated += 1;
    } catch {
      // unique violation = already exists, fine
    }
  }

  return { fundsCreated, subaccountsCreated };
}

/**
 * Resolve a system fund by code. Orgs created before treasury existed
 * (or never opened the treasury page) have no system funds yet, so a
 * known system fund is created on first use instead of failing the
 * caller's write with a 500.
 */
export async function requireSystemFund(orgId: string, code: string) {
  const fund = await prisma.fund.findUnique({
    where: { orgId_code: { orgId, code } },
  });
  if (fund) return fund;
  const system = SYSTEM_FUNDS.find((f) => f.code === code);
  if (!system) {
    throw new Error(`Unknown system fund "${code}" for org ${orgId}.`);
  }
  return prisma.fund.upsert({
    where: { orgId_code: { orgId, code } },
    update: {},
    create: { orgId, code, name: system.name, isSystem: true },
  });
}
