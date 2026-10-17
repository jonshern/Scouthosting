// Treasury posting primitives. Every write here updates the cached
// running balance on the related Fund (and MemberSubaccount if the
// transaction targets the scout-accounts fund) inside one Prisma
// $transaction so reads stay cheap and never see a half-applied
// state.
//
// Reversal-only edits: callers never UPDATE or DELETE a Transaction.
// Mistakes are corrected by inserting an opposite-sign row that
// points at the original via reversesId. The collapsed-pair view in
// the ledger UI hides matched pairs unless the user opts in.

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { SCOUT_ACCOUNTS } from "./money";
import type { TxType } from "./money";

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export type PostInput = {
  orgId: string;
  fundId: string;
  type: TxType;
  amountCents: number;
  description: string;
  memberId?: string | null;
  eventId?: string | null;
  reimbursementId?: string | null;
  salesOrderId?: string | null;
  reversesId?: string | null;
  stripePaymentIntentId?: string | null;
  bankImportRowId?: string | null;
  createdById?: string | null;
  // Optional override; defaults to now().
  postedAt?: Date;
};

export type PostResult = {
  id: string;
  amountCents: number;
};

/**
 * Insert a Transaction and update the relevant cached balances.
 * Caller must already be inside an authorized server action; this
 * helper does no auth itself.
 */
export async function postTransaction(input: PostInput): Promise<PostResult> {
  if (!Number.isFinite(input.amountCents) || input.amountCents === 0) {
    throw new Error("amountCents must be a non-zero finite integer.");
  }
  return prisma.$transaction(async (tx) => {
    return postWithin(tx as unknown as Tx, input);
  });
}

/** Variant that runs inside an existing $transaction. */
export async function postWithin(tx: Tx, input: PostInput): Promise<PostResult> {
  const created = await tx.transaction.create({
    data: {
      orgId: input.orgId,
      fundId: input.fundId,
      type: input.type,
      amountCents: input.amountCents,
      description: input.description.slice(0, 500),
      memberId: input.memberId ?? null,
      eventId: input.eventId ?? null,
      reimbursementId: input.reimbursementId ?? null,
      salesOrderId: input.salesOrderId ?? null,
      reversesId: input.reversesId ?? null,
      stripePaymentIntentId: input.stripePaymentIntentId ?? null,
      bankImportRowId: input.bankImportRowId ?? null,
      createdById: input.createdById ?? null,
      postedAt: input.postedAt ?? new Date(),
    },
  });

  await tx.fund.update({
    where: { id: input.fundId },
    data: { balanceCents: { increment: input.amountCents } },
  });

  if (input.memberId) {
    const fund = await tx.fund.findUnique({
      where: { id: input.fundId },
      select: { code: true },
    });
    if (fund?.code === SCOUT_ACCOUNTS) {
      // Subaccount might not yet exist for a brand-new member; upsert.
      await tx.memberSubaccount.upsert({
        where: { memberId: input.memberId },
        create: {
          orgId: input.orgId,
          memberId: input.memberId,
          balanceCents: input.amountCents,
        },
        update: { balanceCents: { increment: input.amountCents } },
      });
    }
  }

  return { id: created.id, amountCents: created.amountCents };
}

/** Post a reversal entry that cancels an existing transaction. */
export async function reverseTransaction(args: {
  orgId: string;
  originalId: string;
  description?: string;
  createdById?: string | null;
}): Promise<PostResult> {
  return prisma.$transaction((tx) => reverseWithin(tx as unknown as Tx, args));
}

/**
 * reverseTransaction inside an existing $transaction. A transaction may
 * only be reversed once: Transaction.reversesId is unique, so a second
 * reversal racing the first fails on the index (→ "already reversed")
 * instead of refunding twice.
 */
export async function reverseWithin(
  tx: Tx,
  args: { orgId: string; originalId: string; description?: string; createdById?: string | null },
): Promise<PostResult> {
  const orig = await tx.transaction.findUnique({
    where: { id: args.originalId },
  });
  if (!orig || orig.orgId !== args.orgId) {
    throw new Error("Original transaction not found.");
  }
  const existing = await tx.transaction.findFirst({
    where: { reversesId: orig.id },
    select: { id: true },
  });
  if (existing) {
    throw new Error("Transaction already reversed.");
  }
  try {
    return await postWithin(tx, {
      orgId: args.orgId,
      fundId: orig.fundId,
      type: "refund",
      amountCents: -orig.amountCents,
      description: args.description?.slice(0, 500) ?? `Reversal of ${orig.id}`,
      memberId: orig.memberId,
      eventId: orig.eventId,
      reimbursementId: orig.reimbursementId,
      salesOrderId: orig.salesOrderId,
      reversesId: orig.id,
      createdById: args.createdById ?? null,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("Transaction already reversed.");
    }
    throw err;
  }
}

/** Post a transfer between two funds. */
export async function postTransfer(args: {
  orgId: string;
  fromFundId: string;
  toFundId: string;
  amountCents: number;
  description: string;
  createdById?: string | null;
}): Promise<{ outId: string; inId: string }> {
  if (args.amountCents <= 0) {
    throw new Error("transfer amount must be positive");
  }
  return prisma.$transaction((tx) => postTransferWithin(tx as unknown as Tx, args));
}

/** postTransfer inside an existing $transaction. */
export async function postTransferWithin(
  tx: Tx,
  args: {
    orgId: string;
    fromFundId: string;
    toFundId: string;
    amountCents: number;
    description: string;
    createdById?: string | null;
    /** Ties both legs to a sales order so cancelling it can reverse them. */
    salesOrderId?: string | null;
  },
): Promise<{ outId: string; inId: string }> {
  if (args.amountCents <= 0) {
    throw new Error("transfer amount must be positive");
  }
  const out = await postWithin(tx, {
    orgId: args.orgId,
    fundId: args.fromFundId,
    type: "transfer-out",
    amountCents: -args.amountCents,
    description: args.description,
    createdById: args.createdById,
    salesOrderId: args.salesOrderId,
  });
  const incoming = await postWithin(tx, {
    orgId: args.orgId,
    fundId: args.toFundId,
    type: "transfer-in",
    amountCents: args.amountCents,
    description: args.description,
    createdById: args.createdById,
    salesOrderId: args.salesOrderId,
  });
  return { outId: out.id, inId: incoming.id };
}

/** Bulk dues: charge a single fund/amount across many members. */
export async function postBulkDues(args: {
  orgId: string;
  fundId: string;
  amountCents: number;
  description: string;
  memberIds: string[];
  createdById?: string | null;
}): Promise<number> {
  if (args.amountCents <= 0) throw new Error("dues amount must be positive");
  let count = 0;
  await prisma.$transaction(async (tx) => {
    for (const memberId of args.memberIds) {
      await postWithin(tx as unknown as Tx, {
        orgId: args.orgId,
        fundId: args.fundId,
        type: "dues",
        // Charge against the family: negative subaccount balance.
        amountCents: -args.amountCents,
        description: args.description,
        memberId,
        createdById: args.createdById,
      });
      count += 1;
    }
  });
  return count;
}

/** Convenience: write an audit row reflecting a posted transaction. */
export function auditPost(args: {
  orgId: string;
  userId: string | null;
  userDisplay: string | null;
  txnId: string;
  summary: string;
}) {
  audit({
    orgId: args.orgId,
    userId: args.userId,
    userDisplay: args.userDisplay,
    entityType: "Transaction",
    entityId: args.txnId,
    action: "create",
    summary: args.summary,
  });
}

