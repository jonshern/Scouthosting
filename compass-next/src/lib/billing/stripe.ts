// Stripe integration. SDK is an optionalDependency so deployments
// without billing keys (dev / self-hosted) keep working.
//
// One product (Unit), one Stripe Price ID. 60-day trial set on the
// Org row at provision time; we don't pass trial_period_days to
// Stripe — the trial happens pre-checkout (no card on file).

import crypto from "node:crypto";
import type { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/log";

const log = logger.child("stripe");

// Stripe SDK has loose types. Lazy-import is keyed on a small surface.
type StripeLike = {
  checkout: { sessions: { create: (args: unknown) => Promise<{ id: string; url: string | null }> } };
  billingPortal: {
    sessions: { create: (args: unknown) => Promise<{ url: string }> };
  };
  subscriptions: {
    update: (id: string, args: unknown) => Promise<unknown>;
  };
};

let _stripe: StripeLike | null = null;
let _loadAttempted = false;

export async function getStripe(): Promise<StripeLike | null> {
  if (_stripe) return _stripe;
  if (_loadAttempted) return _stripe;
  _loadAttempted = true;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    log.info("STRIPE_SECRET_KEY not set — billing routes will 503.");
    return null;
  }
  try {
    const mod = (await import("stripe")) as {
      default: new (key: string, opts: { apiVersion: string }) => StripeLike;
    };
    _stripe = new mod.default(key, { apiVersion: "2024-11-20.acacia" });
    return _stripe;
  } catch (err) {
    log.warn("Stripe SDK not installed; run `npm i stripe`.", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export async function createCheckoutSession(
  org: {
    id: string;
    slug: string;
    stripeCustomerId?: string | null;
    scoutmasterEmail?: string | null;
  },
  user: { email?: string | null } | null,
  opts: { successUrl: string; cancelUrl: string },
): Promise<{ url: string | null; sessionId: string }> {
  const stripe = await getStripe();
  if (!stripe) throw new Error("stripe_not_configured");
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error("stripe_price_id_missing");

  const customerArgs = org.stripeCustomerId
    ? { customer: org.stripeCustomerId }
    : { customer_email: user?.email || org.scoutmasterEmail };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    allow_promotion_codes: false,
    billing_address_collection: "auto",
    metadata: { orgId: org.id, orgSlug: org.slug },
    subscription_data: { metadata: { orgId: org.id, orgSlug: org.slug } },
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
      items?: { data?: Array<{ price?: { id?: string } }> };
      metadata?: Record<string, string>;
      subscription_details?: { metadata?: Record<string, string> };
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
          currentPeriodEnd: obj.current_period_end
            ? new Date(obj.current_period_end * 1000)
            : null,
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
          currentPeriodEnd: obj.current_period_end
            ? new Date(obj.current_period_end * 1000)
            : null,
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
    obj.metadata?.orgId || obj.subscription_details?.metadata?.orgId;
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

export const _internal = { mapStripeStatus, resolveOrgIdFromEvent };
