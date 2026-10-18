// The owner console's billing report. Subscriptions come from the Org
// rows the Stripe webhook keeps current; money collected comes from the
// BillingPayment rows it records for each paid invoice. Nothing here
// calls Stripe.

import { prisma } from "@/lib/db";
import { intervalForPriceId, PRICES } from "@/lib/billing/pricing";
import type { UnitRow } from "./console";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionMix = {
  paying: number;
  yearly: number;
  monthly: number;
  /** Paying on a Stripe price that isn't STRIPE_PRICE_YEARLY/_MONTHLY. */
  otherPrice: number;
  canceling: number;
  trialing: number;
  trialingWithCard: number;
  pastDue: number;
  trialEnded: number;
  canceled: number;
  comped: number;
  /** Monthly recurring revenue from yearly and monthly subscribers, in cents. */
  mrrCents: number;
};

export function subscriptionMix(units: Pick<UnitRow, "license" | "stripePriceId" | "stripeSubscriptionId">[]): SubscriptionMix {
  const mix: SubscriptionMix = {
    paying: 0,
    yearly: 0,
    monthly: 0,
    otherPrice: 0,
    canceling: 0,
    trialing: 0,
    trialingWithCard: 0,
    pastDue: 0,
    trialEnded: 0,
    canceled: 0,
    comped: 0,
    mrrCents: 0,
  };
  for (const u of units) {
    switch (u.license.kind) {
      case "paid":
      case "canceling": {
        mix.paying += 1;
        if (u.license.kind === "canceling") mix.canceling += 1;
        const interval = intervalForPriceId(u.stripePriceId);
        if (interval === "year") {
          mix.yearly += 1;
          mix.mrrCents += Math.round((PRICES.year.usd * 100) / 12);
        } else if (interval === "month") {
          mix.monthly += 1;
          mix.mrrCents += PRICES.month.usd * 100;
        } else {
          mix.otherPrice += 1;
        }
        break;
      }
      case "trial":
        mix.trialing += 1;
        if (u.stripeSubscriptionId) mix.trialingWithCard += 1;
        break;
      case "past_due":
        mix.pastDue += 1;
        break;
      case "trial_ended":
        mix.trialEnded += 1;
        break;
      case "canceled":
        mix.canceled += 1;
        break;
      case "comped":
        mix.comped += 1;
        break;
    }
  }
  return mix;
}

export function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export type MonthTotal = { month: string; cents: number; payments: number };

/** The last `count` calendar months (UTC), oldest first, with zero months filled in. */
export function monthBuckets(
  payments: { paidAt: Date; amountCents: number }[],
  now: Date,
  count = 12,
): MonthTotal[] {
  const out: MonthTotal[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({ month: d.toISOString().slice(0, 7), cents: 0, payments: 0 });
  }
  const byMonth = new Map(out.map((m) => [m.month, m]));
  for (const p of payments) {
    const m = byMonth.get(p.paidAt.toISOString().slice(0, 7));
    if (m) {
      m.cents += p.amountCents;
      m.payments += 1;
    }
  }
  return out;
}

export type Mode = "live" | "test";

export async function paymentReport(mode: Mode, now: Date = new Date()) {
  const livemode = mode === "live";
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const monthsStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const sum = (where: object) =>
    prisma.billingPayment.aggregate({ where: { livemode, ...where }, _sum: { amountCents: true }, _count: true });
  const [all, ytd, last30, months, recent] = await Promise.all([
    sum({}),
    sum({ paidAt: { gte: yearStart } }),
    sum({ paidAt: { gte: since30 } }),
    prisma.billingPayment.findMany({
      where: { livemode, paidAt: { gte: monthsStart } },
      select: { paidAt: true, amountCents: true },
    }),
    prisma.billingPayment.findMany({
      where: { livemode },
      orderBy: { paidAt: "desc" },
      take: 25,
      include: { org: { select: { slug: true, displayName: true } } },
    }),
  ]);
  return {
    allTime: { cents: all._sum.amountCents ?? 0, payments: all._count },
    yearToDate: { cents: ytd._sum.amountCents ?? 0, payments: ytd._count },
    last30: { cents: last30._sum.amountCents ?? 0, payments: last30._count },
    months: monthBuckets(months, now),
    recent,
  };
}

/** Live once a live payment exists; until then, Stripe test mode. */
export async function defaultMode(): Promise<Mode> {
  const live = await prisma.billingPayment.count({ where: { livemode: true } });
  return live > 0 ? "live" : "test";
}

export async function billingEvents(now: Date = new Date()) {
  const since90 = new Date(now.getTime() - 90 * DAY_MS);
  const [cancellations, failures, trialsEnded] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: "billing.subscription_deleted", createdAt: { gte: since90 } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { org: { select: { slug: true, displayName: true } } },
    }),
    prisma.auditLog.findMany({
      where: { action: "billing.payment_failed", createdAt: { gte: since90 } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { org: { select: { slug: true, displayName: true } } },
    }),
    prisma.org.findMany({
      where: { isDemo: false, trialEndsAt: { gte: since90, lte: now } },
      select: { stripeSubscriptionId: true },
    }),
  ]);
  const converted = trialsEnded.filter((o) => o.stripeSubscriptionId).length;
  return {
    cancellations,
    failures,
    trialConversion: { ended: trialsEnded.length, converted },
  };
}
