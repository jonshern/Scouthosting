"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { ensureScoutSalesLink, settleSalesOrderAsPaid, slugify } from "@/lib/sales";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { dollarsToCents } from "@/lib/treasury/money";
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

export type SalesState = { ok?: true; error?: string; campaignId?: string; orderId?: string } | null;

const CampaignSchema = z.object({
  orgSlug: z.string().min(1),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  startsOn: z.string().min(1),
  endsOn: z.string().min(1),
  fundId: z.string().min(1),
  proceedsSplit: z.enum(["per-scout", "whole-unit"]).default("per-scout"),
  scoutSplitPct: z.string().optional().or(z.literal("")),
  publicSlug: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function upsertCampaign(_prev: SalesState, formData: FormData): Promise<SalesState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = CampaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;
  const startsOn = new Date(d.startsOn);
  const endsOn = new Date(d.endsOn);
  if (endsOn < startsOn) return { error: "End date must be after start date." };

  const fund = await prisma.fund.findUnique({ where: { id: d.fundId } });
  if (!fund || fund.orgId !== auth.org.id) return { error: "Fund not found." };

  const split = d.scoutSplitPct ? parseInt(d.scoutSplitPct, 10) : 70;
  const slug = d.publicSlug ? slugify(d.publicSlug) : null;

  const data = {
    orgId: auth.org.id,
    name: d.name,
    startsOn,
    endsOn,
    fundId: fund.id,
    proceedsSplit: d.proceedsSplit,
    scoutSplitPct: Math.min(100, Math.max(0, isNaN(split) ? 70 : split)),
    publicSlug: slug,
    description: d.description?.trim() || null,
  };

  if (d.id) {
    const existing = await prisma.salesCampaign.findUnique({ where: { id: d.id } });
    if (!existing || existing.orgId !== auth.org.id) return { error: "Campaign not found." };
    await prisma.salesCampaign.update({ where: { id: existing.id }, data });
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "SalesCampaign",
      entityId: existing.id,
      action: "update",
      summary: `Updated campaign ${d.name}`,
    });
    revalidatePath(`/o/${auth.org.slug}/admin/sales/${existing.id}`);
    return { ok: true, campaignId: existing.id };
  }
  const created = await prisma.salesCampaign.create({ data });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "SalesCampaign",
    entityId: created.id,
    action: "create",
    summary: `Created campaign ${d.name}`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/sales`);
  return { ok: true, campaignId: created.id };
}

const ProductSchema = z.object({
  orgSlug: z.string().min(1),
  campaignId: z.string().min(1),
  id: z.string().optional(),
  sku: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  price: z.string().min(1),
  unitCost: z.string().optional().or(z.literal("")),
  imageUrl: z.string().url().optional().or(z.literal("")),
});

export async function upsertProduct(_prev: SalesState, formData: FormData): Promise<SalesState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = ProductSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;
  const campaign = await prisma.salesCampaign.findUnique({ where: { id: d.campaignId } });
  if (!campaign || campaign.orgId !== auth.org.id) return { error: "Campaign not found." };

  const data = {
    campaignId: campaign.id,
    sku: d.sku,
    name: d.name,
    priceCents: dollarsToCents(d.price),
    unitCostCents: d.unitCost ? dollarsToCents(d.unitCost) : 0,
    imageUrl: d.imageUrl || null,
  };
  if (d.id) {
    // Products have no orgId; scope through the campaign we just checked.
    const { count } = await prisma.salesProduct.updateMany({
      where: { id: d.id, campaignId: campaign.id },
      data,
    });
    if (count === 0) return { error: "Product not found." };
  } else {
    await prisma.salesProduct.create({ data });
  }
  revalidatePath(`/o/${auth.org.slug}/admin/sales/${campaign.id}`);
  return { ok: true };
}

const PrizeSchema = z.object({
  orgSlug: z.string().min(1),
  campaignId: z.string().min(1),
  threshold: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function addPrizeTier(_prev: SalesState, formData: FormData): Promise<SalesState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = PrizeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;
  const campaign = await prisma.salesCampaign.findUnique({ where: { id: d.campaignId } });
  if (!campaign || campaign.orgId !== auth.org.id) return { error: "Campaign not found." };

  await prisma.prizeTier.create({
    data: {
      campaignId: campaign.id,
      thresholdCents: dollarsToCents(d.threshold),
      name: d.name,
      description: d.description?.trim() || null,
    },
  });
  revalidatePath(`/o/${auth.org.slug}/admin/sales/${campaign.id}`);
  return { ok: true };
}

const ManualOrderSchema = z.object({
  orgSlug: z.string().min(1),
  campaignId: z.string().min(1),
  source: z.enum(["leader-manual", "scout-personal", "booth"]).default("leader-manual"),
  scoutMemberId: z.string().optional().or(z.literal("")),
  buyerName: z.string().trim().min(1).max(120),
  buyerEmail: z.string().trim().email().max(320).optional().or(z.literal("")),
  buyerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  buyerAddress: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  // serialized line items, JSON: [{productId,quantity}]
  items: z.string().min(1),
  markPaid: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function createManualOrder(_prev: SalesState, formData: FormData): Promise<SalesState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = ManualOrderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;
  const campaign = await prisma.salesCampaign.findUnique({ where: { id: d.campaignId } });
  if (!campaign || campaign.orgId !== auth.org.id) return { error: "Campaign not found." };

  let items: { productId: string; quantity: number }[];
  try {
    items = JSON.parse(d.items);
    if (!Array.isArray(items) || items.length === 0) throw new Error();
  } catch {
    return { error: "No items selected." };
  }
  const products = await prisma.salesProduct.findMany({
    where: { campaignId: campaign.id, id: { in: items.map((i) => i.productId) } },
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  let totalCents = 0;
  const orderItems: { productId: string; quantity: number; priceCentsAtOrder: number }[] = [];
  for (const i of items) {
    const p = productById.get(i.productId);
    if (!p) return { error: `Product not found: ${i.productId}` };
    const qty = Math.max(1, Math.floor(Number(i.quantity) || 0));
    if (qty <= 0) continue;
    totalCents += p.priceCents * qty;
    orderItems.push({ productId: p.id, quantity: qty, priceCentsAtOrder: p.priceCents });
  }
  if (orderItems.length === 0) return { error: "No items selected." };

  const scoutMemberId = await ownedIdOrNull("member", auth.org.id, d.scoutMemberId);
  if (scoutMemberId === false) return { error: "Scout not found." };

  const order = await prisma.salesOrder.create({
    data: {
      orgId: auth.org.id,
      campaignId: campaign.id,
      source: d.source,
      scoutMemberId: scoutMemberId,
      buyerName: d.buyerName,
      buyerEmail: d.buyerEmail || null,
      buyerPhone: d.buyerPhone || null,
      buyerAddress: d.buyerAddress || null,
      notes: d.notes || null,
      totalCents,
      items: { create: orderItems },
    },
  });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "SalesOrder",
    entityId: order.id,
    action: "create",
    summary: `Manual order ${campaign.name} ${order.id.slice(0, 8)} ($${(totalCents / 100).toFixed(2)})`,
  });
  if (d.markPaid === "on") {
    try {
      await settleSalesOrderAsPaid({
        orgId: auth.org.id,
        orderId: order.id,
        paymentSource: "manual",
      });
    } catch (e) {
      return { error: `Order created, but settlement failed: ${(e as Error).message}` };
    }
  }
  revalidatePath(`/o/${auth.org.slug}/admin/sales/${campaign.id}`);
  return { ok: true, orderId: order.id };
}

const GenerateScoutLinksSchema = z.object({
  orgSlug: z.string().min(1),
  campaignId: z.string().min(1),
});

export async function generateScoutLinks(
  _prev: SalesState,
  formData: FormData,
): Promise<SalesState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = GenerateScoutLinksSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const campaign = await prisma.salesCampaign.findUnique({ where: { id: parsed.data.campaignId } });
  if (!campaign || campaign.orgId !== auth.org.id) return { error: "Campaign not found." };
  if (!auth.org.encryptedDek) return { error: "Org vault not provisioned." };

  const youths = await prisma.member.findMany({
    where: { orgId: auth.org.id, isYouth: true, deletedAt: null, status: "active" },
  });
  const dek = unwrapDekWithMaster(auth.org);
  let created = 0;
  for (const m of youths) {
    const pii = decryptMemberPii(m, dek, auth.org.id);
    const before = await prisma.scoutSalesLink.count({
      where: { campaignId: campaign.id, memberId: m.id },
    });
    await ensureScoutSalesLink({
      orgId: auth.org.id,
      campaignId: campaign.id,
      memberId: m.id,
      scoutFirstName: pii.firstName,
      scoutLastName: pii.lastName,
    });
    if (before === 0) created += 1;
  }
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "ScoutSalesLink",
    action: "create",
    summary: `Generated ${created} new scout sales links for ${campaign.name}`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/sales/${campaign.id}`);
  return { ok: true };
}

const DeliverySchema = z.object({
  orgSlug: z.string().min(1),
  orderId: z.string().min(1),
  itemId: z.string().min(1),
  quantityDelivered: z.string().min(1),
});

export async function setItemDelivered(
  _prev: SalesState,
  formData: FormData,
): Promise<SalesState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = DeliverySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };

  const item = await prisma.salesOrderItem.findUnique({
    where: { id: parsed.data.itemId },
    include: { order: true },
  });
  if (!item || item.order.orgId !== auth.org.id || item.orderId !== parsed.data.orderId) {
    return { error: "Item not found." };
  }
  const target = Math.max(
    0,
    Math.min(item.quantity, parseInt(parsed.data.quantityDelivered, 10) || 0),
  );
  await prisma.salesOrderItem.update({
    where: { id: item.id },
    data: { quantityDelivered: target },
  });

  // If every line item is fully delivered and the order is paid,
  // bump the order status to delivered.
  const sibs = await prisma.salesOrderItem.findMany({
    where: { orderId: item.orderId },
  });
  const allDelivered =
    sibs.length > 0 && sibs.every((s) => s.quantityDelivered >= s.quantity);
  if (allDelivered && item.order.status === "paid") {
    await prisma.salesOrder.update({
      where: { id: item.order.id },
      data: { status: "delivered", deliveredAt: new Date() },
    });
  }

  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "SalesOrderItem",
    entityId: item.id,
    action: "update",
    summary: `Delivered ${target}/${item.quantity}`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/sales/${item.order.campaignId}`);
  return { ok: true };
}

const StatusSchema = z.object({
  orgSlug: z.string().min(1),
  orderId: z.string().min(1),
  status: z.enum(["placed", "paid", "delivered", "cancelled"]),
});

export async function updateOrderStatus(_prev: SalesState, formData: FormData): Promise<SalesState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = StatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };

  const order = await prisma.salesOrder.findUnique({ where: { id: parsed.data.orderId } });
  if (!order || order.orgId !== auth.org.id) return { error: "Order not found." };

  if (parsed.data.status === "paid" && order.status !== "paid") {
    try {
      await settleSalesOrderAsPaid({
        orgId: auth.org.id,
        orderId: order.id,
        paymentSource: "manual",
      });
    } catch (e) {
      return { error: (e as Error).message };
    }
  } else if (parsed.data.status === "delivered" && order.status !== "paid" && order.status !== "delivered") {
    return { error: "Mark paid before delivered." };
  } else {
    await prisma.salesOrder.update({
      where: { id: order.id },
      data: {
        status: parsed.data.status,
        deliveredAt: parsed.data.status === "delivered" ? new Date() : order.deliveredAt,
      },
    });
  }
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "SalesOrder",
    entityId: order.id,
    action: "update",
    summary: `Order ${order.id.slice(0, 8)} → ${parsed.data.status}`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/sales/${order.campaignId}`);
  return { ok: true };
}

const BoothSchema = z.object({
  orgSlug: z.string().min(1),
  campaignId: z.string().min(1),
  location: z.string().trim().min(1).max(120),
  scheduledAt: z.string().min(1),
  total: z.string().min(1),
  staffMemberIds: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function recordBoothSale(_prev: SalesState, formData: FormData): Promise<SalesState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = BoothSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;
  const campaign = await prisma.salesCampaign.findUnique({ where: { id: d.campaignId } });
  if (!campaign || campaign.orgId !== auth.org.id) return { error: "Campaign not found." };

  const staff = await ownedIds(
    "member",
    auth.org.id,
    (d.staffMemberIds ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const totalCents = dollarsToCents(d.total);
  if (totalCents <= 0) return { error: "Total must be positive." };

  const booth = await prisma.boothSale.create({
    data: {
      orgId: auth.org.id,
      campaignId: campaign.id,
      location: d.location,
      scheduledAt: new Date(d.scheduledAt),
      staffMemberIds: staff,
      totalCents,
      notes: d.notes || null,
    },
  });

  // Treasury: post the gross + per-staff scout-account splits.
  // We model this as a synthetic SalesOrder to keep the ledger clean.
  const order = await prisma.salesOrder.create({
    data: {
      orgId: auth.org.id,
      campaignId: campaign.id,
      source: "booth",
      scoutMemberId: null, // booth is unattributed at the order level
      buyerName: `Booth: ${d.location}`,
      totalCents,
      status: "placed",
      notes: `Booth ${booth.id}; staff [${staff.join(",")}]`,
    },
  });

  // Settle order → deposit lands in campaign fund.
  await settleSalesOrderAsPaid({
    orgId: auth.org.id,
    orderId: order.id,
    paymentSource: "manual",
  });

  // Per-Scout split: divide the scout share evenly among staff
  // members. We bypass settleSalesOrderAsPaid's per-scout logic (it
  // requires order.scoutMemberId) and post directly here.
  if (campaign.proceedsSplit === "per-scout" && staff.length > 0 && campaign.scoutSplitPct > 0) {
    const totalScoutShare = Math.floor((totalCents * campaign.scoutSplitPct) / 100);
    const perScout = Math.floor(totalScoutShare / staff.length);
    if (perScout > 0) {
      const scoutAcctsFund = await prisma.fund.findUnique({
        where: { orgId_code: { orgId: auth.org.id, code: "scout-accounts" } },
      });
      if (scoutAcctsFund) {
        for (const memberId of staff) {
          // Split the scout share into per-member transfer + credit.
          await prisma.$transaction(async (tx) => {
            void tx;
          });
          // Use the helpers; they handle their own internal $transaction.
          const { postTransfer, postTransaction } = await import("@/lib/treasury/posting");
          await postTransfer({
            orgId: auth.org.id,
            fromFundId: campaign.fundId,
            toFundId: scoutAcctsFund.id,
            amountCents: perScout,
            description: `Booth split → ${memberId.slice(0, 8)}`,
          });
          await postTransaction({
            orgId: auth.org.id,
            fundId: scoutAcctsFund.id,
            type: "fundraiser-credit",
            amountCents: perScout,
            description: `Booth credit: ${campaign.name} (${d.location})`,
            memberId,
            salesOrderId: order.id,
          });
        }
      }
    }
  }

  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "BoothSale",
    entityId: booth.id,
    action: "create",
    summary: `Booth ${d.location} $${(totalCents / 100).toFixed(2)} (${staff.length} staff)`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/sales/${campaign.id}`);
  return { ok: true };
}
