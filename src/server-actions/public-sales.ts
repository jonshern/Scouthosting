"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { createMemberPaymentSession } from "@/lib/treasury/stripe";
import { centsToDollars } from "@/lib/treasury/money";

// Public-page checkout. Visitor fills a cart on /sell/[slug] (or
// /sell/[slug]/[scoutSlug]); we create a SalesOrder in "placed"
// status, then redirect to Stripe Checkout. The treasury-stripe
// webhook calls settleSalesOrderAsPaid() once the payment succeeds
// because the metadata carries salesOrderId.

const Schema = z.object({
  publicSlug: z.string().min(1),
  scoutSlug: z.string().optional().or(z.literal("")),
  buyerName: z.string().trim().min(1).max(120),
  buyerEmail: z.string().trim().email().max(320),
  buyerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  buyerAddress: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  items: z.string().min(1),
});

async function originForRequest(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function startPublicCheckout(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string } | null> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  const campaign = await prisma.salesCampaign.findUnique({
    where: { publicSlug: d.publicSlug },
    include: { org: true, fund: true },
  });
  if (!campaign || campaign.closedAt) return { error: "Campaign not active." };
  if (campaign.endsOn < new Date()) return { error: "Campaign has ended." };

  let scoutMemberId: string | null = null;
  if (d.scoutSlug) {
    const link = await prisma.scoutSalesLink.findUnique({
      where: {
        campaignId_publicSlug: { campaignId: campaign.id, publicSlug: d.scoutSlug },
      },
    });
    if (!link) return { error: "Scout link not found." };
    scoutMemberId = link.memberId;
  }

  let parsedItems: { productId: string; quantity: number }[];
  try {
    parsedItems = JSON.parse(d.items);
    if (!Array.isArray(parsedItems) || parsedItems.length === 0) throw new Error();
  } catch {
    return { error: "No items selected." };
  }

  const products = await prisma.salesProduct.findMany({
    where: {
      campaignId: campaign.id,
      id: { in: parsedItems.map((i) => i.productId) },
      archived: false,
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  let totalCents = 0;
  const orderItems: { productId: string; quantity: number; priceCentsAtOrder: number }[] = [];
  for (const i of parsedItems) {
    const p = byId.get(i.productId);
    if (!p) continue;
    const qty = Math.max(1, Math.floor(Number(i.quantity) || 0));
    if (qty <= 0) continue;
    totalCents += p.priceCents * qty;
    orderItems.push({ productId: p.id, quantity: qty, priceCentsAtOrder: p.priceCents });
  }
  if (orderItems.length === 0) return { error: "No items selected." };
  if (totalCents < 50) return { error: "Cart total must be at least $0.50." };

  if (!campaign.org.treasuryStripeKeyCt) {
    return { error: "This unit hasn't connected Stripe yet — buying online isn't available." };
  }

  // Create the order up front in "placed" state.
  const order = await prisma.salesOrder.create({
    data: {
      orgId: campaign.org.id,
      campaignId: campaign.id,
      source: "public-page",
      scoutMemberId,
      buyerName: d.buyerName,
      buyerEmail: d.buyerEmail,
      buyerPhone: d.buyerPhone || null,
      buyerAddress: d.buyerAddress || null,
      notes: d.notes || null,
      totalCents,
      items: { create: orderItems },
    },
  });

  const baseUrl = await originForRequest();
  let session;
  try {
    session = await createMemberPaymentSession({
      org: campaign.org,
      memberId: scoutMemberId,
      amountCents: totalCents,
      description: `${campaign.name} order ${order.id.slice(0, 8)} · ${centsToDollars(totalCents)}`,
      buyerEmail: d.buyerEmail,
      successUrl: `${baseUrl}/sell/${campaign.publicSlug}/thanks?order=${order.id}`,
      cancelUrl: `${baseUrl}/sell/${campaign.publicSlug}${d.scoutSlug ? `/${d.scoutSlug}` : ""}?cancelled=1`,
      metadata: {
        salesOrderId: order.id,
        sales: "1",
      },
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!session.url) return { error: "Stripe did not return a checkout URL." };

  await prisma.salesOrder.update({
    where: { id: order.id },
    data: { stripePaymentIntentId: session.sessionId },
  });

  redirect(session.url);
}
