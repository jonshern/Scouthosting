"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import {
  postTransaction,
  postBulkDues,
  postTransfer,
  reverseTransaction,
} from "@/lib/treasury/posting";
import {
  provisionTreasury,
  requireSystemFund,
} from "@/lib/treasury/provision";
import {
  dollarsToCents,
  SCOUT_ACCOUNTS,
  type TxType,
} from "@/lib/treasury/money";
import { recomputeOrgBalances } from "@/lib/treasury/recompute";
import { ownedIdOrNull, ownedIds } from "@/lib/tenancy/owned";

type AuthOk = {
  user: NonNullable<Awaited<ReturnType<typeof getSession>>["user"]>;
  org: NonNullable<Awaited<ReturnType<typeof prisma.org.findUnique>>>;
};
type AuthErr = { error: string };
async function authorizeLeader(orgSlug: string): Promise<AuthOk | AuthErr> {
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) return { error: "Site not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };
  return { user, org };
}

export type TreasuryState = { ok?: true; error?: string; message?: string } | null;

const ProvisionSchema = z.object({ orgSlug: z.string().min(1) });

export async function provisionTreasuryAction(
  _prev: TreasuryState,
  formData: FormData,
): Promise<TreasuryState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = ProvisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };

  const summary = await provisionTreasury(auth.org.id);
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Treasury",
    action: "provision",
    summary: `Provisioned treasury (+${summary.fundsCreated} funds, +${summary.subaccountsCreated} subaccounts)`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/treasury`);
  return {
    ok: true,
    message: `Provisioned: +${summary.fundsCreated} funds, +${summary.subaccountsCreated} subaccounts.`,
  };
}

const PostSchema = z.object({
  orgSlug: z.string().min(1),
  fundId: z.string().min(1),
  type: z.enum(["dues", "deposit", "expense", "manual", "fundraiser-credit", "event-charge"]),
  amount: z.string().min(1),
  // sign is "charge" (negative against subaccount) or "credit" (positive)
  sign: z.enum(["charge", "credit"]),
  description: z.string().trim().min(1).max(500),
  memberId: z.string().optional().or(z.literal("")),
  eventId: z.string().optional().or(z.literal("")),
});

export async function postTransactionAction(
  _prev: TreasuryState,
  formData: FormData,
): Promise<TreasuryState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = PostSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;

  const fund = await prisma.fund.findUnique({ where: { id: d.fundId } });
  if (!fund || fund.orgId !== auth.org.id) return { error: "Fund not found." };

  const cents = dollarsToCents(d.amount);
  if (cents <= 0) return { error: "Amount must be positive." };
  const signed = d.sign === "charge" ? -cents : cents;

  const memberId = await ownedIdOrNull("member", auth.org.id, d.memberId);
  if (memberId === false) return { error: "Member not found." };
  const eventId = await ownedIdOrNull("event", auth.org.id, d.eventId);
  if (eventId === false) return { error: "Event not found." };

  const created = await postTransaction({
    orgId: auth.org.id,
    fundId: fund.id,
    type: d.type as TxType,
    amountCents: signed,
    description: d.description,
    memberId,
    eventId,
    createdById: auth.user.id,
  });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Transaction",
    entityId: created.id,
    action: "create",
    summary: `${d.type} ${d.sign} ${d.description}`,
  });

  revalidatePath(`/o/${auth.org.slug}/admin/treasury`);
  revalidatePath(`/o/${auth.org.slug}/admin/treasury/ledger`);
  if (d.memberId) {
    revalidatePath(`/o/${auth.org.slug}/admin/treasury/members/${d.memberId}`);
  }
  return { ok: true, message: "Posted." };
}

const BulkDuesSchema = z.object({
  orgSlug: z.string().min(1),
  amount: z.string().min(1),
  description: z.string().trim().min(1).max(500),
  scope: z.enum(["all-active", "youth", "adults", "patrol"]),
  patrol: z.string().optional().or(z.literal("")),
});

export async function postBulkDuesAction(
  _prev: TreasuryState,
  formData: FormData,
): Promise<TreasuryState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = BulkDuesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;

  const cents = dollarsToCents(d.amount);
  if (cents <= 0) return { error: "Amount must be positive." };

  const where = {
    orgId: auth.org.id,
    deletedAt: null,
    status: { in: ["active", "prospect"] },
    ...(d.scope === "youth" ? { isYouth: true } : {}),
    ...(d.scope === "adults" ? { isYouth: false } : {}),
    ...(d.scope === "patrol" && d.patrol ? { patrol: d.patrol } : {}),
  };
  const members = await prisma.member.findMany({ where, select: { id: true } });
  if (members.length === 0) return { error: "No members matched the scope." };

  const fund = await requireSystemFund(auth.org.id, SCOUT_ACCOUNTS);
  const count = await postBulkDues({
    orgId: auth.org.id,
    fundId: fund.id,
    amountCents: cents,
    description: d.description,
    memberIds: members.map((m) => m.id),
    createdById: auth.user.id,
  });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Transaction",
    action: "create",
    summary: `Bulk dues: ${count} members @ $${(cents / 100).toFixed(2)} (${d.description})`,
  });

  revalidatePath(`/o/${auth.org.slug}/admin/treasury`);
  revalidatePath(`/o/${auth.org.slug}/admin/treasury/ledger`);
  return { ok: true, message: `Posted dues for ${count} member${count === 1 ? "" : "s"}.` };
}

const ReverseSchema = z.object({
  orgSlug: z.string().min(1),
  txnId: z.string().min(1),
});

export async function reverseTransactionAction(
  _prev: TreasuryState,
  formData: FormData,
): Promise<TreasuryState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = ReverseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  try {
    const out = await reverseTransaction({
      orgId: auth.org.id,
      originalId: parsed.data.txnId,
      createdById: auth.user.id,
    });
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "Transaction",
      entityId: out.id,
      action: "create",
      summary: `Reversed transaction ${parsed.data.txnId}`,
    });
    revalidatePath(`/o/${auth.org.slug}/admin/treasury/ledger`);
    return { ok: true, message: "Reversed." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const TransferSchema = z.object({
  orgSlug: z.string().min(1),
  fromFundId: z.string().min(1),
  toFundId: z.string().min(1),
  amount: z.string().min(1),
  description: z.string().trim().min(1).max(500),
});

export async function postTransferAction(
  _prev: TreasuryState,
  formData: FormData,
): Promise<TreasuryState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = TransferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const cents = dollarsToCents(parsed.data.amount);
  if (cents <= 0) return { error: "Amount must be positive." };
  if (parsed.data.fromFundId === parsed.data.toFundId) {
    return { error: "From and to must differ." };
  }

  const owned = await ownedIds("fund", auth.org.id, [
    parsed.data.fromFundId,
    parsed.data.toFundId,
  ]);
  if (owned.length !== 2) return { error: "Fund not found." };

  await postTransfer({
    orgId: auth.org.id,
    fromFundId: parsed.data.fromFundId,
    toFundId: parsed.data.toFundId,
    amountCents: cents,
    description: parsed.data.description,
    createdById: auth.user.id,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/treasury/ledger`);
  return { ok: true, message: "Transferred." };
}

const RecomputeSchema = z.object({
  orgSlug: z.string().min(1),
  fix: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function recomputeBalancesAction(
  _prev: TreasuryState,
  formData: FormData,
): Promise<TreasuryState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = RecomputeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };

  const report = await recomputeOrgBalances(auth.org.id, {
    fix: parsed.data.fix === "on",
  });
  revalidatePath(`/o/${auth.org.slug}/admin/treasury`);
  const drifted = report.funds.length + report.members.length;
  return {
    ok: true,
    message: drifted === 0
      ? "Balances clean."
      : `${drifted} drift row${drifted === 1 ? "" : "s"}${report.fixed ? " (fixed)" : ""}.`,
  };
}
