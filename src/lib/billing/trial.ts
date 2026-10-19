// Free trial and the billing summary every surface reads (the admin
// banner and billing page, and GET /api/v1/orgs/:slug/subscription for
// Waypoint and Lantern). Pure functions; the webhook in
// lib/billing/stripe.ts is the only writer of the Stripe fields.

import { deriveBillingStatus, type BillingGate, type BillingStatus, type OrgLikeForBilling } from "./state";

// New units get the first 3 months free while we see whether troops use
// it (Jon, 2026-10-19). TRIAL_DAYS in env changes it (30 goes back to a
// month); it applies to units made after the change, and the marketing
// pages pick it up on their next build.
export const DEFAULT_TRIAL_DAYS = 90;

export function parseTrialDays(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : DEFAULT_TRIAL_DAYS;
}

export const TRIAL_DAYS = parseTrialDays(process.env.TRIAL_DAYS);

/** "3 months", "1 month" or "45 days", for copy. */
export function freePeriod(days: number = TRIAL_DAYS): string {
  if (days % 30 !== 0) return `${days} days`;
  const months = days / 30;
  return `${months} month${months === 1 ? "" : "s"}`;
}

/** "first 3 months" or "first month", for "… free". */
export function firstFreePeriod(days: number = TRIAL_DAYS): string {
  return days === 30 ? "first month" : `first ${freePeriod(days)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function trialEndsAtFrom(start: Date = new Date()): Date {
  return new Date(start.getTime() + TRIAL_DAYS * DAY_MS);
}

// Stripe rejects a `trial_end` less than 48 hours out, so a unit that
// subscribes in the last two days of its trial is charged right away.
const MIN_STRIPE_TRIAL_MS = 48 * 60 * 60 * 1000 + 5 * 60 * 1000;

/** Unix seconds to pass as `subscription_data.trial_end`, or null. */
export function stripeTrialEnd(trialEndsAt: Date | null, now: Date = new Date()): number | null {
  if (!trialEndsAt) return null;
  if (trialEndsAt.getTime() - now.getTime() < MIN_STRIPE_TRIAL_MS) return null;
  return Math.floor(trialEndsAt.getTime() / 1000);
}

export type BillingSummary = {
  status: BillingStatus;
  gate: BillingGate;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** A Stripe subscription exists, so a card is on file. */
  subscribed: boolean;
  /** Admin pages other than billing are closed until the unit subscribes. */
  locked: boolean;
  /** Free access given from the owner console runs until this date. */
  compedUntil: string | null;
};

export type OrgForSummary = OrgLikeForBilling & {
  stripeSubscriptionId?: string | null;
};

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export function billingSummary(
  org: OrgForSummary,
  { stripeConfigured, now = new Date() }: { stripeConfigured: boolean; now?: Date },
): BillingSummary {
  const state = deriveBillingStatus(org, now);
  // Units made before self-serve sign-up have no trial end date; they
  // stay open. Suspension is an operator hold, not something paying
  // fixes, so it isn't a billing lock either. And with no Stripe keys
  // there is no way to pay, so nothing locks.
  const billingLock =
    state.gate === "readonly" &&
    state.reason !== "trial_misconfigured" &&
    state.status !== "suspended";
  return {
    status: state.reason === "trial_misconfigured" ? "active" : state.status,
    gate: state.reason === "trial_misconfigured" ? "writeable" : state.gate,
    trialDaysLeft: state.trialDaysLeft,
    trialEndsAt: iso(org?.trialEndsAt),
    currentPeriodEnd: iso(org?.currentPeriodEnd),
    cancelAtPeriodEnd: !!org?.cancelAtPeriodEnd,
    subscribed: !!org?.stripeSubscriptionId,
    locked: stripeConfigured && billingLock,
    compedUntil: state.reason === "comped" ? iso(org?.compedUntil) : null,
  };
}
