// The one price list, shared by the marketing pages and the billing
// page. Each unit pays one of two ways for everything (Compass,
// Waypoint, Summit); the first month is the free trial either way. The
// Stripe Price IDs live in env (STRIPE_PRICE_YEARLY / _MONTHLY) and
// must match these amounts (docs/billing.md).

import { TRIAL_DAYS } from "./trial";

export type BillingInterval = "year" | "month";

export const PRICES: Record<BillingInterval, { usd: number; short: string; long: string }> = {
  year: { usd: 99, short: "$99", long: "$99 a year" },
  month: { usd: 10, short: "$10", long: "$10 a month" },
};

export const YEARLY_SAVINGS_USD = PRICES.month.usd * 12 - PRICES.year.usd;

export const PRICE_LINE = `${PRICES.year.long} or ${PRICES.month.long}, first month free`;

export const TRIAL_LINE = `${TRIAL_DAYS} days free, no card needed`;

export function stripePriceIdFor(interval: BillingInterval): string | null {
  const id = interval === "year" ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
  return id && id.startsWith("price_") ? id : null;
}

/** Which plan a stored Stripe price is, for the billing page. */
export function intervalForPriceId(priceId: string | null | undefined): BillingInterval | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_YEARLY) return "year";
  if (priceId === process.env.STRIPE_PRICE_MONTHLY) return "month";
  return null;
}
