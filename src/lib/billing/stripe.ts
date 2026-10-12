// Stripe integration for the platform subscription (one price per
// unit per month). Deployments without billing keys (dev / self-hosted)
// keep working: every call 503s through `stripe_not_configured`.
//
// The free trial starts at sign-up with no card (Org.trialEndsAt, see
// lib/billing/trial.ts). When a unit subscribes during the trial,
// Checkout carries the rest of the trial over as Stripe's `trial_end`,
// so the first charge lands the day the trial would have ended and
// Stripe renews monthly from there.

import crypto from "node:crypto";
import type { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/log";
import { createStripeRestClient } from "./stripe-rest";
import { stripeTrialEnd } from "./trial";

const log = logger.child("stripe");

type StripeLike = ReturnType<typeof createStripeRestClient>;

let _stripe: StripeLike | null = null;

export async function getStripe(): Promise<StripeLike | null> {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !isConfigured()) {
    log.info("Stripe keys not set — billing is off.");
    return null;
  }
  _stripe = createStripeRestClient(key);
  return _stripe;
}

/** Test hook: swap the client (or clear it so the next call rebuilds). */
export function setStripeClientForTests(client: StripeLike | null): void {
  _stripe = client;
}

// Real keys only: Terraform seeds Secret Manager with "unset-…"
// placeholders, and treating those as configured would lock every unit
// whose trial ends with no way to pay.
export function isConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const price = process.env.STRIPE_PRICE_ID ?? "";
  return /^(sk|rk)_(test|live)_/.test(key) && price.startsWith("price_");
}

export async function createCheckoutSession(
  org: {
    id: string;
    slug: string;
    stripeCustomerId?: string | null;
    scoutmasterEmail?: string | null;
    trialEndsAt?: Date | null;
  },
  user: { email?: string | null } | null,
  opts: { successUrl: string; cancelUrl: string; now?: Date },
): Promise<{ url: string | null; sessionId: string }> {
  const stripe = await getStripe();
  if (!stripe) throw new Error("stripe_not_configured");
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error("stripe_price_id_missing");

  const customerArgs = org.stripeCustomerId
    ? { customer: org.stripeCustomerId }
    : { customer_email: user?.email || org.scoutmasterEmail };

  const trialEnd = stripeTrialEnd(org.trialEndsAt ?? null, opts.now);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    payment_method_collection: "always",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    allow_promotion_codes: false,
    billing_address_collection: "auto",
    client_reference_id: org.id,
    metadata: { orgId: org.id, orgSlug: org.slug },
    subscription_data: {
      metadata: { orgId: org.id, orgSlug: org.slug },
      ...(trialEnd ? { trial_end: trialEnd } : {}),
    },
    ...customerArgs,
  });

  return { url: session.url, sessionId: session.id };
}

export async function createBillingPortalSession(
  org: { stripeCustomerId?: string | null },
  { returnUrl }: { returnUrl: string },
): Promise<{ url: string }> {
  const stripe = await getStripe();
  if (!stripe) throw new Error("stripe_not_configured");
  if (!org.stripeCustomerId) throw new Error("stripe_no_customer");
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

export async function cancelAtPeriodEnd(org: {
  id: string;
  stripeSubscriptionId?: string | null;
}): Promise<unknown> {
  const stripe = await getStripe();
  if (!stripe) throw new Error("stripe_not_configured");
  if (!org.stripeSubscriptionId) throw new Error("no_subscription");
  const sub = await stripe.subscriptions.update(org.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
  await prisma.org.update({
    where: { id: org.id },
    data: { cancelAtPeriodEnd: true },
  });
  return sub;
}

export async function reactivateSubscription(org: {
  id: string;
  stripeSubscriptionId?: string | null;
}): Promise<unknown> {
  const stripe = await getStripe();
  if (!stripe) throw new Error("stripe_not_configured");
  if (!org.stripeSubscriptionId) throw new Error("no_subscription");
  const sub = await stripe.subscriptions.update(org.stripeSubscriptionId, {
    cancel_at_period_end: false,
  });
  await prisma.org.update({
    where: { id: org.id },
    data: { cancelAtPeriodEnd: false },
  });
  return sub;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyStripeSignature(
  rawBody: string | Buffer,
  header: string | null | undefined,
  secret: string | undefined,
  opts: { tolerance?: number; now?: Date } = {},
): VerifyResult {
  if (!header || !secret) return { ok: false, reason: "missing_inputs" };
  const tolerance = opts.tolerance ?? 5 * 60 * 1000;
  const now = (opts.now ?? new Date()).getTime();

  const parts = String(header).split(",").reduce<Record<string, string[]>>((acc, kv) => {
    const [k, v] = kv.split("=", 2);
    if (k && v) (acc[k.trim()] = acc[k.trim()] || []).push(v.trim());
    return acc;
  }, {});
  const ts = parts.t?.[0];
  const v1Sigs = parts.v1 || [];
  if (!ts || v1Sigs.length === 0) return { ok: false, reason: "bad_header" };

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad_timestamp" };
  if (Math.abs(now - tsNum * 1000) > tolerance) return { ok: false, reason: "timestamp_skew" };

  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const signed = `${ts}.${body}`;
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");

  for (const sig of v1Sigs) {
    if (sig.length !== expected.length) continue;
    try {
      if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return { ok: true };
      }
    } catch {
      // length mismatch handled above
    }
  }
  return { ok: false, reason: "no_match" };
}

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
]);

type StripeEvent = {
  type?: string;
  data?: {
    object?: {
      id?: string;
      customer?: string;
      subscription?: string;
      status?: string;
      cancel_at_period_end?: boolean;
      current_period_end?: number;
      items?: { data?: Array<{ price?: { id?: string }; current_period_end?: number }> };
      metadata?: Record<string, string>;
      subscription_details?: { metadata?: Record<string, string> };
      // Newer API versions move an invoice's subscription metadata here.
      parent?: { subscription_details?: { metadata?: Record<string, string> } };
    };
  };
};

export type SyncResult =
  | { ok: true; ignored?: boolean; reason?: string }
  | { ok: false; reason: string };

export async function syncFromStripeEvent(event: StripeEvent): Promise<SyncResult> {
  if (!event?.type) return { ok: false, reason: "bad_event" };
  if (!HANDLED_EVENTS.has(event.type)) {
    return { ok: true, ignored: true, reason: `unhandled:${event.type}` };
  }

  const obj = event.data?.object || {};
  const orgId = await resolveOrgIdFromEvent(event);
  if (!orgId) return { ok: false, reason: "no_org_match" };

  switch (event.type) {
    case "checkout.session.completed": {
      await prisma.org.update({
        where: { id: orgId },
        data: {
          stripeCustomerId: obj.customer || undefined,
          stripeSubscriptionId: obj.subscription || undefined,
          subscriptionStatus: "active" as SubscriptionStatus,
          cancelAtPeriodEnd: false,
        },
      });
      await stripeAudit(orgId, "billing.checkout_completed", `Subscription started (${obj.id}).`);
      return { ok: true };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const status = mapStripeStatus(obj.status);
      const cancelAtPeriodEnd = !!obj.cancel_at_period_end;
      await prisma.org.update({
        where: { id: orgId },
        data: {
          stripeSubscriptionId: obj.id || undefined,
          stripePriceId: obj.items?.data?.[0]?.price?.id || undefined,
          subscriptionStatus: status as SubscriptionStatus,
          currentPeriodEnd: periodEnd(obj),
          cancelAtPeriodEnd,
        },
      });
      await stripeAudit(
        orgId,
        "billing.subscription_updated",
        `Status=${status}, cancel_at_period_end=${cancelAtPeriodEnd}.`,
      );
      return { ok: true };
    }
    case "customer.subscription.deleted": {
      await prisma.org.update({
        where: { id: orgId },
        data: {
          subscriptionStatus: "canceled" as SubscriptionStatus,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: periodEnd(obj),
        },
      });
      await stripeAudit(orgId, "billing.subscription_deleted", `Subscription ${obj.id} ended.`);
      return { ok: true };
    }
    case "invoice.payment_failed": {
      await prisma.org.update({
        where: { id: orgId },
        data: { subscriptionStatus: "past_due" as SubscriptionStatus },
      });
      await stripeAudit(orgId, "billing.payment_failed", `Invoice ${obj.id} payment failed.`);
      return { ok: true };
    }
    case "invoice.payment_succeeded": {
      const org = await prisma.org.findUnique({
        where: { id: orgId },
        select: { subscriptionStatus: true },
      });
      if (org?.subscriptionStatus === "past_due") {
        await prisma.org.update({
          where: { id: orgId },
          data: { subscriptionStatus: "active" as SubscriptionStatus },
        });
        await stripeAudit(
          orgId,
          "billing.payment_recovered",
          `Invoice ${obj.id} paid; status restored.`,
        );
      }
      return { ok: true };
    }
    default:
      return { ok: true, ignored: true };
  }
}

async function resolveOrgIdFromEvent(event: StripeEvent): Promise<string | null> {
  const obj = event.data?.object || {};
  const direct =
    obj.metadata?.orgId ||
    obj.subscription_details?.metadata?.orgId ||
    obj.parent?.subscription_details?.metadata?.orgId;
  if (direct) return direct;

  const customerId = obj.customer;
  if (customerId) {
    const org = await prisma.org.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    if (org) return org.id;
  }
  return null;
}

// The period end sits on the subscription in older API versions and on
// each subscription item from 2025-03-31 on; the webhook endpoint's API
// version decides which one arrives.
function periodEnd(obj: NonNullable<NonNullable<StripeEvent["data"]>["object"]>): Date | null {
  const secs = obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end;
  return secs ? new Date(secs * 1000) : null;
}

function mapStripeStatus(stripeStatus: string | undefined): string {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "past_due";
  }
}

async function stripeAudit(orgId: string, action: string, summary: string): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orgId,
        userId: null,
        userDisplay: "Stripe webhook",
        entityType: "Org",
        entityId: orgId,
        action,
        summary: summary ? String(summary).slice(0, 500) : null,
      },
    });
  } catch (err) {
    log.warn("Audit write failed.", {
      err: err instanceof Error ? err.message : String(err),
      orgId,
      action,
    });
  }
}

export const _internal = { mapStripeStatus, resolveOrgIdFromEvent, periodEnd };
