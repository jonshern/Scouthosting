// Stripe integration. The SDK is an optionalDependency so deployments
// without billing keys (dev / self-hosted) keep working. Same shape as
// lib/mail.js + lib/sms.js: lazy-import the SDK, fall back to a clear
// error if env vars are missing.
//
// One product (Unit, $99/yr), one Stripe Price ID, configured via
// STRIPE_PRICE_ID. 60-day trial set on the Org row at provision time
// (server/provision.js); we don't pass trial_period_days to Stripe —
// we let the trial happen pre-checkout (no card on file). This means
// the Stripe subscription begins active when the leader actually
// chooses to subscribe, which matches the marketing promise of "no
// card needed to start."
//
// Webhook events we care about:
//   checkout.session.completed   → first paid subscription, link customer to Org
//   customer.subscription.updated → status / period / cancel-at-period-end
//   customer.subscription.deleted → status='canceled'
//   invoice.payment_failed        → status='past_due'
//   invoice.payment_succeeded     → status='active' (recovers from past_due)
//
// All other event types ack with 200 so Stripe stops retrying.

import crypto from "node:crypto";
import { prisma } from "./db.js";
import { logger } from "./log.js";

const log = logger.child("stripe");

let _stripe = null;
let _loadAttempted = false;

/**
 * Lazy-load the Stripe SDK. Returns null if the SDK isn't installed or
 * STRIPE_SECRET_KEY isn't set. Callers must handle null (typically by
 * 503'ing the route).
 */
export async function getStripe() {
  if (_stripe) return _stripe;
  if (_loadAttempted) return _stripe;
  _loadAttempted = true;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    log.info("STRIPE_SECRET_KEY not set — billing routes will 503.");
    return null;
  }
  try {
    const { default: Stripe } = await import("stripe");
    _stripe = new Stripe(key, { apiVersion: "2024-11-20.acacia" });
    return _stripe;
  } catch (err) {
    log.warn({ err: err.message }, "Stripe SDK not installed; run `npm i stripe`.");
    return null;
  }
}

export function isConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

/**
 * Create a Stripe Checkout session for an org's first subscription, or
 * for resubscribing after cancel. Returns the session URL the caller
 * should redirect to.
 *
 * @param {object} org           Org row
 * @param {object} user          User row (for customer email)
 * @param {object} opts          { successUrl, cancelUrl }
 * @returns {Promise<{url: string, sessionId: string}>}
 */
export async function createCheckoutSession(org, user, opts) {
  const stripe = await getStripe();
  if (!stripe) throw new Error("stripe_not_configured");
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error("stripe_price_id_missing");

  // Reuse the existing customer if we have one (resubscribe path);
  // otherwise let Checkout create one and we'll capture it from the
  // webhook.
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
    // metadata.orgId is how the webhook links the resulting Stripe
    // customer/subscription back to the Compass Org row.
    metadata: { orgId: org.id, orgSlug: org.slug },
    subscription_data: {
      metadata: { orgId: org.id, orgSlug: org.slug },
    },
    ...customerArgs,
  });

  return { url: session.url, sessionId: session.id };
}

/**
 * Open Stripe's hosted Customer Portal for self-serve card update,
 * invoice history, and cancel/resume. Returns a one-shot URL that
 * the admin redirects to from POST /admin/billing/portal.
 *
 * Org must already have a stripeCustomerId — the portal is for
 * existing customers only. Pre-checkout orgs (still trialing) don't
 * have a Stripe customer record yet; their /admin/billing page
 * surfaces the "Subscribe" CTA instead.
 *
 * The portal's behavior (which products customers can switch
 * between, whether they can pause vs cancel, return URL) is
 * configured in the Stripe Dashboard at
 * https://dashboard.stripe.com/test/settings/billing/portal — not
 * code. Set the return URL there to match `returnUrl` you pass.
 */
export async function createBillingPortalSession(org, { returnUrl }) {
  const stripe = await getStripe();
  if (!stripe) throw new Error("stripe_not_configured");
  if (!org.stripeCustomerId) throw new Error("stripe_no_customer");
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

/**
 * Cancel at period end. Leaves the org writeable until currentPeriodEnd
 * so they finish out what they paid for. Webhook sync flips
 * cancelAtPeriodEnd → true via the subscription.updated event; we also
 * mirror it locally for an immediate UI response.
 */
export async function cancelAtPeriodEnd(org) {
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

/**
 * Undo a pending cancellation (only works before currentPeriodEnd).
 */
export async function reactivateSubscription(org) {
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

/* ------------------------------------------------------------------ */
/* Webhook signature verification                                      */
/* ------------------------------------------------------------------ */

/**
 * Verify a Stripe webhook signature. Stripe uses its own scheme (not
 * Svix), so we can't reuse lib/resendWebhook.js verbatim. We avoid
 * stripe.webhooks.constructEvent so this stays callable without the
 * SDK loaded — handy for unit tests.
 *
 * @param {string|Buffer} rawBody  Untouched request body
 * @param {string}        header   Value of `stripe-signature` header
 * @param {string}        secret   STRIPE_WEBHOOK_SECRET (whsec_…)
 * @param {{ tolerance?: number, now?: Date }} [opts]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function verifyStripeSignature(rawBody, header, secret, opts = {}) {
  if (!header || !secret) return { ok: false, reason: "missing_inputs" };
  const tolerance = opts.tolerance ?? 5 * 60 * 1000;
  const now = (opts.now ?? new Date()).getTime();

  const parts = String(header).split(",").reduce((acc, kv) => {
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
      // length mismatch caught above; ignore decoding errors.
    }
  }
  return { ok: false, reason: "no_match" };
}

/* ------------------------------------------------------------------ */
/* Webhook event → Org state sync                                      */
/* ------------------------------------------------------------------ */

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
]);

/**
 * Apply a Stripe event to the matching Org row. Returns a summary
 * string for the audit log + a status flag.
 *
 * Pure-ish: uses Prisma but no Stripe SDK calls, so callers can pass
 * synthesized events in tests.
 */
export async function syncFromStripeEvent(event) {
  if (!event?.type) return { ok: false, reason: "bad_event" };
  if (!HANDLED_EVENTS.has(event.type)) {
    return { ok: true, ignored: true, reason: `unhandled:${event.type}` };
  }

  const obj = event.data?.object || {};
  const orgId = await resolveOrgIdFromEvent(event);
  if (!orgId) return { ok: false, reason: "no_org_match" };

  switch (event.type) {
    case "checkout.session.completed": {
      // First subscription (or resubscribe): capture customer + sub IDs.
      const data = {
        stripeCustomerId: obj.customer || undefined,
        stripeSubscriptionId: obj.subscription || undefined,
        subscriptionStatus: "active",
        cancelAtPeriodEnd: false,
      };
      await prisma.org.update({ where: { id: orgId }, data });
      await audit(orgId, "billing.checkout_completed", `Subscription started (${obj.id}).`);
      return { ok: true };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const status = mapStripeStatus(obj.status);
      const data = {
        stripeSubscriptionId: obj.id || undefined,
        stripePriceId: obj.items?.data?.[0]?.price?.id || undefined,
        subscriptionStatus: status,
        currentPeriodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000) : null,
        cancelAtPeriodEnd: !!obj.cancel_at_period_end,
      };
      await prisma.org.update({ where: { id: orgId }, data });
      await audit(orgId, "billing.subscription_updated", `Status=${status}, cancel_at_period_end=${data.cancelAtPeriodEnd}.`);
      return { ok: true };
    }
    case "customer.subscription.deleted": {
      await prisma.org.update({
        where: { id: orgId },
        data: {
          subscriptionStatus: "canceled",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000) : null,
        },
      });
      await audit(orgId, "billing.subscription_deleted", `Subscription ${obj.id} ended.`);
      return { ok: true };
    }
    case "invoice.payment_failed": {
      await prisma.org.update({
        where: { id: orgId },
        data: { subscriptionStatus: "past_due" },
      });
      await audit(orgId, "billing.payment_failed", `Invoice ${obj.id} payment failed.`);
      return { ok: true };
    }
    case "invoice.payment_succeeded": {
      // Only flip to active if we were past_due — don't downgrade
      // a trialing customer back to active prematurely.
      const org = await prisma.org.findUnique({
        where: { id: orgId },
        select: { subscriptionStatus: true },
      });
      if (org?.subscriptionStatus === "past_due") {
        await prisma.org.update({
          where: { id: orgId },
          data: { subscriptionStatus: "active" },
        });
        await audit(orgId, "billing.payment_recovered", `Invoice ${obj.id} paid; status restored.`);
      }
      return { ok: true };
    }
    default:
      return { ok: true, ignored: true };
  }
}

/**
 * Find the Compass Org for a Stripe event. Tries metadata.orgId first
 * (set on every checkout session and subscription), then falls back to
 * matching the customer ID.
 */
async function resolveOrgIdFromEvent(event) {
  const obj = event.data?.object || {};
  const direct = obj.metadata?.orgId || obj.subscription_details?.metadata?.orgId;
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

/**
 * Map Stripe's subscription.status enum to ours. Stripe has more
 * states (incomplete, incomplete_expired, paused, trialing, active,
 * past_due, canceled, unpaid). We collapse to our 5.
 */
function mapStripeStatus(stripeStatus) {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      // We model trial pre-checkout, so a Stripe-side trial is
      // treated as active (they have a card on file).
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
    case "paused":
      return "past_due";
    default:
      return "past_due";
  }
}

// Webhook events have no user — write the AuditLog row directly with a
// "Stripe webhook" actor label so the /admin/audit view stays readable.
async function audit(orgId, action, summary) {
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
    log.warn({ err: err.message, orgId, action }, "Audit write failed.");
  }
}

export const _internal = { mapStripeStatus, resolveOrgIdFromEvent };
