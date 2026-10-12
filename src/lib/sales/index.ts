// Sales / fundraising helpers. Settlement always goes through the
// Treasury ledger (postTransaction / postTransfer); we never store
// running totals here, only summaries derived at read time.

import type { Org, SalesCampaign } from "@prisma/client";
import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { postTransferWithin, postWithin, reverseWithin, type Tx } from "@/lib/treasury/posting";
import { SCOUT_ACCOUNTS } from "@/lib/treasury/money";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type LeaderboardRow = {
  memberId: string | null;
  scoutName: string;
  patrol: string | null;
  totalCents: number;
  orders: number;
};

/** Per-Scout leaderboard for a campaign. Includes paid + placed orders. */
export async function leaderboardForCampaign(
  org: Pick<Org, "id" | "encryptedDek">,
  campaignId: string,
): Promise<LeaderboardRow[]> {
  const orders = await prisma.salesOrder.findMany({
    where: { orgId: org.id, campaignId },
    select: {
      scoutMemberId: true,
      totalCents: true,
      status: true,
    },
  });
  // Aggregate by scoutMemberId.
  type Row = { totalCents: number; orders: number };
  const agg = new Map<string, Row>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const key = o.scoutMemberId ?? "__unattributed";
    const cur = agg.get(key) ?? { totalCents: 0, orders: 0 };
    cur.totalCents += o.totalCents;
    cur.orders += 1;
    agg.set(key, cur);
  }
  const memberIds = [...agg.keys()].filter((k) => k !== "__unattributed");
  if (memberIds.length === 0 || !org.encryptedDek) {
    return [...agg.entries()]
      .map(([k, v]) => ({
        memberId: k === "__unattributed" ? null : k,
        scoutName: k === "__unattributed" ? "(unattributed)" : "(encrypted)",
        patrol: null,
        totalCents: v.totalCents,
        orders: v.orders,
      }))
      .sort((a, b) => b.totalCents - a.totalCents);
  }
  const dek = unwrapDekWithMaster(org);
  const members = await prisma.member.findMany({
    where: { orgId: org.id, id: { in: memberIds } },
  });
  const labels = new Map(
    members.map((m) => {
      const pii = decryptMemberPii(m, dek, org.id);
      return [m.id, { name: `${pii.firstName} ${pii.lastName}`.trim(), patrol: m.patrol }];
    }),
  );
  return [...agg.entries()]
    .map(([k, v]) => {
      const lbl = k === "__unattributed" ? null : labels.get(k);
      return {
        memberId: k === "__unattributed" ? null : k,
        scoutName: k === "__unattributed" ? "(unattributed)" : lbl?.name ?? "(removed)",
        patrol: lbl?.patrol ?? null,
        totalCents: v.totalCents,
        orders: v.orders,
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents);
}

export async function reachedPrizeTiers(
  campaignId: string,
  totalCents: number,
): Promise<{ id: string; name: string; thresholdCents: number; reached: boolean }[]> {
  const tiers = await prisma.prizeTier.findMany({
    where: { campaignId },
    orderBy: { thresholdCents: "asc" },
  });
  return tiers.map((t) => ({
    id: t.id,
    name: t.name,
    thresholdCents: t.thresholdCents,
    reached: totalCents >= t.thresholdCents,
  }));
}

/**
 * Mark an order as paid and post the treasury settlement: gross
 * deposit to the campaign fund, then a per-Scout transfer + scout
 * subaccount credit if the campaign splits per-scout.
 */
export async function settleSalesOrderAsPaid(args: {
  orgId: string;
  orderId: string;
  paymentSource: "manual" | "stripe";
  stripePaymentIntentId?: string | null;
}): Promise<{ settled: boolean }> {
  // One transaction, with the order row locked first: the Stripe
  // webhook (which fires twice per payment) and a leader's "mark paid"
  // can land together, and only the first may post. Everything posts or
  // nothing does, so a failure part way leaves the order unpaid and a
  // retry starts clean.
  return prisma.$transaction(async (stx) => {
    const tx = stx as unknown as Tx;
    await stx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${args.orderId} FOR UPDATE`;
    const order = await stx.salesOrder.findUnique({
      where: { id: args.orderId },
      include: { campaign: { include: { fund: true } } },
    });
    if (!order || order.orgId !== args.orgId) throw new Error("Order not found.");
    if (order.status === "paid" || order.status === "delivered") return { settled: false };
    if (order.depositTransactionId) return { settled: false };
    // A late or retried Stripe event mustn't revive an order a leader
    // cancelled (and refunded); a leader can still mark it paid by hand.
    if (order.status === "cancelled" && args.paymentSource === "stripe") return { settled: false };

    const campaign = order.campaign;
    const grossCents = order.totalCents;

    const deposit = await postWithin(tx, {
      orgId: args.orgId,
      fundId: campaign.fundId,
      type: "deposit",
      amountCents: grossCents,
      description: `Sale: ${campaign.name} order ${order.id.slice(0, 8)}`,
      salesOrderId: order.id,
      stripePaymentIntentId: args.stripePaymentIntentId ?? null,
    });

    if (
      campaign.proceedsSplit === "per-scout" &&
      order.scoutMemberId &&
      campaign.scoutSplitPct > 0
    ) {
      const scoutShareCents = Math.floor(
        (grossCents * Math.min(100, campaign.scoutSplitPct)) / 100,
      );
      const scoutAcctsFund = await stx.fund.findUnique({
        where: { orgId_code: { orgId: args.orgId, code: SCOUT_ACCOUNTS } },
      });
      if (scoutAcctsFund && scoutShareCents > 0) {
        await postTransferWithin(tx, {
          orgId: args.orgId,
          fromFundId: campaign.fundId,
          toFundId: scoutAcctsFund.id,
          amountCents: scoutShareCents,
          description: `Sale split → scout (${order.id.slice(0, 8)})`,
          salesOrderId: order.id,
        });
        // Credit the scout's subaccount.
        await postWithin(tx, {
          orgId: args.orgId,
          fundId: scoutAcctsFund.id,
          type: "fundraiser-credit",
          amountCents: scoutShareCents,
          description: `Sale credit: ${campaign.name}`,
          memberId: order.scoutMemberId,
          salesOrderId: order.id,
        });
      }
    }

    await stx.salesOrder.update({
      where: { id: order.id },
      data: {
        status: "paid",
        paidAt: new Date(),
        depositTransactionId: deposit.id,
        stripePaymentIntentId: args.stripePaymentIntentId ?? order.stripePaymentIntentId,
      },
    });
    return { settled: true };
  });
}

/**
 * Move an order back to "placed" or "cancelled". A paid or delivered
 * order's postings (deposit, split transfer, scout credit) are
 * reversed in the same transaction, so the ledger and the scout's
 * account no longer count money that went back to the buyer. Locks the
 * order like settleSalesOrderAsPaid, so the two can't interleave.
 */
export async function unsettleSalesOrder(args: {
  orgId: string;
  orderId: string;
  status: "placed" | "cancelled";
  createdById?: string | null;
}): Promise<{ reversed: number }> {
  return prisma.$transaction(async (stx) => {
    const tx = stx as unknown as Tx;
    await stx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${args.orderId} FOR UPDATE`;
    const order = await stx.salesOrder.findUnique({ where: { id: args.orderId } });
    if (!order || order.orgId !== args.orgId) throw new Error("Order not found.");

    const id8 = order.id.slice(0, 8);
    const postings = await stx.transaction.findMany({
      where: {
        orgId: args.orgId,
        reversesId: null,
        reversedBy: { none: {} },
        OR: [
          { salesOrderId: order.id },
          // Split transfers posted before they carried salesOrderId.
          {
            salesOrderId: null,
            type: { in: ["transfer-out", "transfer-in"] },
            description: `Sale split → scout (${id8})`,
          },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    for (const t of postings) {
      await reverseWithin(tx, {
        orgId: args.orgId,
        originalId: t.id,
        description: `Order ${id8} ${args.status}: reversal of ${t.description}`,
        createdById: args.createdById ?? null,
      });
    }
    await stx.salesOrder.update({
      where: { id: order.id },
      data: { status: args.status, paidAt: null, deliveredAt: null, depositTransactionId: null },
    });
    return { reversed: postings.length };
  });
}

/** Helper: find or create a ScoutSalesLink for a member. */
export async function ensureScoutSalesLink(args: {
  orgId: string;
  campaignId: string;
  memberId: string;
  scoutFirstName: string;
  scoutLastName: string;
}): Promise<{ publicSlug: string }> {
  const existing = await prisma.scoutSalesLink.findUnique({
    where: {
      campaignId_memberId: {
        campaignId: args.campaignId,
        memberId: args.memberId,
      },
    },
  });
  if (existing) return { publicSlug: existing.publicSlug };

  // Build a slug; collide-resolve by appending a short suffix.
  const baseSlug = slugify(`${args.scoutFirstName}-${args.scoutLastName}`) || args.memberId.slice(0, 8);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    try {
      const created = await prisma.scoutSalesLink.create({
        data: {
          campaignId: args.campaignId,
          memberId: args.memberId,
          publicSlug: candidate,
        },
      });
      return { publicSlug: created.publicSlug };
    } catch {
      // collision, try again
    }
  }
  // Last-ditch: append memberId tail.
  const final = `${baseSlug}-${args.memberId.slice(0, 6)}`;
  const created = await prisma.scoutSalesLink.create({
    data: { campaignId: args.campaignId, memberId: args.memberId, publicSlug: final },
  });
  return { publicSlug: created.publicSlug };
}

export type CampaignSummary = {
  ordersPlaced: number;
  ordersPaid: number;
  grossCents: number;
  paidCents: number;
};

export async function summarizeCampaign(campaignId: string): Promise<CampaignSummary> {
  const orders = await prisma.salesOrder.findMany({
    where: { campaignId },
    select: { totalCents: true, status: true },
  });
  let placed = 0;
  let paid = 0;
  let gross = 0;
  let paidCents = 0;
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    placed += 1;
    gross += o.totalCents;
    if (o.status === "paid" || o.status === "delivered") {
      paid += 1;
      paidCents += o.totalCents;
    }
  }
  return { ordersPlaced: placed, ordersPaid: paid, grossCents: gross, paidCents };
}

export type PublicProduct = {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
};

export async function publicProductsForCampaign(campaignId: string): Promise<PublicProduct[]> {
  const products = await prisma.salesProduct.findMany({
    where: { campaignId, archived: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, sku: true, name: true, priceCents: true, imageUrl: true },
  });
  return products;
}

export type CampaignPublic = {
  id: string;
  name: string;
  description: string | null;
  endsOn: Date;
  fundCode: string;
};

export async function publicCampaignBySlug(slug: string): Promise<
  | (CampaignPublic & { products: PublicProduct[]; orgSlug: string; orgDisplayName: string })
  | null
> {
  const c = (await prisma.salesCampaign.findUnique({
    where: { publicSlug: slug },
    include: { fund: true, org: true },
  })) as (SalesCampaign & {
    fund: { code: string };
    org: { slug: string; displayName: string };
  }) | null;
  if (!c) return null;
  if (c.closedAt) return null;
  const products = await publicProductsForCampaign(c.id);
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    endsOn: c.endsOn,
    fundCode: c.fund.code,
    products,
    orgSlug: c.org.slug,
    orgDisplayName: c.org.displayName,
  };
}
