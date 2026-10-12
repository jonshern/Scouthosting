// Treasury Stripe webhook. The org is identified by `?org=<slug>` so
// we know which webhook secret to verify against (per-org). Events
// we handle:
//   - checkout.session.completed
//   - payment_intent.succeeded
// Both post a Transaction (deposit + scout-account credit if memberId
// metadata is present) and a separate Stripe-fees row when the event
// surfaces a fee total.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  decryptOrgWebhookSecret,
  verifyOrgWebhookSignature,
} from "@/lib/treasury/stripe";
import {
  GENERAL_FUND,
  SCOUT_ACCOUNTS,
  STRIPE_FEES_FUND,
} from "@/lib/treasury/money";
import { postTransferWithin, postWithin, type Tx } from "@/lib/treasury/posting";
import { applyStripeOnce, stripeKey } from "@/lib/billing/stripe-idempotency";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const orgSlug = url.searchParams.get("org");
  if (!orgSlug) return NextResponse.json({ error: "missing_org" }, { status: 400 });

  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const secret = decryptOrgWebhookSecret(org);
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature");
  const ok = verifyOrgWebhookSignature({
    rawBody,
    signatureHeader: sigHeader,
    webhookSecret: secret,
  });
  if (!ok) return NextResponse.json({ error: "bad_signature" }, { status: 400 });

  type EventBody = {
    id?: string;
    type?: string;
    data?: {
      object?: {
        id?: string;
        amount_total?: number;
        amount_received?: number;
        application_fee_amount?: number;
        currency?: string;
        metadata?: Record<string, string>;
        payment_intent?: string;
      };
    };
  };
  let event: EventBody;
  try {
    event = JSON.parse(rawBody) as EventBody;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const eventId = event.id ?? "unknown";
  const eventType = event.type ?? "unknown";
  const obj = event.data?.object ?? {};
  const meta = obj.metadata ?? {};

  if (meta.treasury !== "1") {
    // Not our flow — likely platform-billing webhook misrouted.
    return NextResponse.json({ ok: true, ignored: "non-treasury" });
  }

  if (eventType !== "checkout.session.completed" && eventType !== "payment_intent.succeeded") {
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  const piId = obj.payment_intent ?? obj.id ?? null;
  if (!piId) {
    return NextResponse.json({ error: "no_payment_intent" }, { status: 400 });
  }

  // Sales-order branch: settle through the sales pipeline so prizes,
  // per-Scout split, and SalesOrder.depositTransactionId stay
  // consistent with manually-marked-paid orders.
  if (meta.salesOrderId) {
    const order = await prisma.salesOrder.findUnique({ where: { id: meta.salesOrderId } });
    if (!order || order.orgId !== org.id) {
      return NextResponse.json({ error: "sales_order_not_found" }, { status: 404 });
    }
    if (order.status === "paid" || order.status === "delivered") {
      return NextResponse.json({ ok: true, ignored: "already-settled" });
    }
    const { settleSalesOrderAsPaid } = await import("@/lib/sales");
    let settled: boolean;
    try {
      ({ settled } = await settleSalesOrderAsPaid({
        orgId: org.id,
        orderId: order.id,
        paymentSource: "stripe",
        stripePaymentIntentId: piId,
      }));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
    // The other event for this payment (or a leader) settled it first.
    if (!settled) return NextResponse.json({ ok: true, ignored: "already-settled" });
    audit({
      orgId: org.id,
      userId: null,
      userDisplay: "Stripe webhook",
      entityType: "SalesOrder",
      entityId: order.id,
      action: "update",
      summary: `Sales order ${order.id.slice(0, 8)} marked paid via Stripe (${piId})`,
    });
    return NextResponse.json({ ok: true });
  }

  // Member-balance payment branch (treasury): credit the member's
  // subaccount. One payment arrives as two events (checkout session and
  // payment intent), sometimes at the same moment, so every posting
  // happens once, together, keyed on the payment intent.
  const amountCents = obj.amount_received ?? obj.amount_total ?? 0;
  if (amountCents <= 0) {
    return NextResponse.json({ error: "zero_amount" }, { status: 400 });
  }

  const memberId = meta.memberId || null;
  // Resolve target funds.
  const generalFund = await prisma.fund.findUnique({
    where: { orgId_code: { orgId: org.id, code: GENERAL_FUND } },
  });
  const scoutAccountsFund = await prisma.fund.findUnique({
    where: { orgId_code: { orgId: org.id, code: SCOUT_ACCOUNTS } },
  });
  if (!generalFund || !scoutAccountsFund) {
    return NextResponse.json({ error: "treasury_unprovisioned" }, { status: 503 });
  }
  const fee = obj.application_fee_amount;
  const feesFund =
    fee && fee > 0
      ? await prisma.fund.findUnique({ where: { orgId_code: { orgId: org.id, code: STRIPE_FEES_FUND } } })
      : null;

  const applied = await applyStripeOnce(
    { key: stripeKey("treasury", piId), eventId, eventType },
    async (stx) => {
      const tx = stx as unknown as Tx;
      // Step 1: deposit lands in general.
      const dep = await postWithin(tx, {
        orgId: org.id,
        fundId: generalFund.id,
        type: "deposit",
        amountCents,
        description: memberId ? "Online member payment" : "Online deposit",
        memberId: memberId ?? undefined,
        stripePaymentIntentId: piId,
      });
      // Step 2: if memberId, transfer the gross from general →
      // scout-accounts and credit the member's subaccount.
      if (memberId) {
        await postTransferWithin(tx, {
          orgId: org.id,
          fromFundId: generalFund.id,
          toFundId: scoutAccountsFund.id,
          amountCents,
          description: `Online payment crediting ${memberId.slice(0, 8)}`,
        });
        await postWithin(tx, {
          orgId: org.id,
          fundId: scoutAccountsFund.id,
          type: "deposit",
          amountCents,
          description: "Online payment credit",
          memberId,
          stripePaymentIntentId: piId,
        });
      }
      // Step 3: Stripe fee, when the event carries it.
      if (feesFund && fee && fee > 0) {
        await postWithin(tx, {
          orgId: org.id,
          fundId: feesFund.id,
          type: "expense",
          amountCents: -fee,
          description: `Stripe fee (${piId})`,
          stripePaymentIntentId: piId,
        });
      }
      return dep;
    },
  );
  if (applied.duplicate) {
    return NextResponse.json({ ok: true, ignored: "duplicate" });
  }
  const dep = applied.result;

  audit({
    orgId: org.id,
    userId: null,
    userDisplay: "Stripe webhook",
    entityType: "Transaction",
    entityId: dep.id,
    action: "create",
    summary: `Treasury webhook ${eventType} (${eventId}) → ${amountCents}c`,
  });

  return NextResponse.json({ ok: true });
}
