import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.STRIPE_PRICE_YEARLY = "price_year";
  process.env.STRIPE_PRICE_MONTHLY = "price_month";
});

import { monthBuckets, subscriptionMix } from "./billing-report";
import type { License, LicenseKind } from "./license";

const lic = (kind: LicenseKind) => ({ kind }) as License;

describe("subscriptionMix", () => {
  it("counts payers by price and adds up monthly recurring revenue", () => {
    const mix = subscriptionMix([
      { license: lic("paid"), stripePriceId: "price_year", stripeSubscriptionId: "s1" },
      { license: lic("canceling"), stripePriceId: "price_month", stripeSubscriptionId: "s2" },
      { license: lic("paid"), stripePriceId: "price_old", stripeSubscriptionId: "s3" },
      { license: lic("trial"), stripePriceId: null, stripeSubscriptionId: "s4" },
      { license: lic("trial"), stripePriceId: null, stripeSubscriptionId: null },
      { license: lic("past_due"), stripePriceId: "price_month", stripeSubscriptionId: "s5" },
      { license: lic("comped"), stripePriceId: null, stripeSubscriptionId: null },
    ]);
    expect(mix).toMatchObject({
      paying: 3,
      yearly: 1,
      monthly: 1,
      otherPrice: 1,
      canceling: 1,
      trialing: 2,
      trialingWithCard: 1,
      pastDue: 1,
      comped: 1,
    });
    // $99/12 rounds to 825 cents, plus $10.
    expect(mix.mrrCents).toBe(825 + 1000);
  });
});

describe("monthBuckets", () => {
  it("fills twelve months oldest first and drops older payments", () => {
    const now = new Date("2026-10-18T00:00:00Z");
    const months = monthBuckets(
      [
        { paidAt: new Date("2026-10-02T00:00:00Z"), amountCents: 1000 },
        { paidAt: new Date("2026-10-15T00:00:00Z"), amountCents: 9900 },
        { paidAt: new Date("2025-11-30T00:00:00Z"), amountCents: 1000 },
        { paidAt: new Date("2025-10-30T00:00:00Z"), amountCents: 5000 },
      ],
      now,
    );
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ month: "2025-11", cents: 1000, payments: 1 });
    expect(months[11]).toEqual({ month: "2026-10", cents: 10900, payments: 2 });
  });
});
