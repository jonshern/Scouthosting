import { describe, expect, it } from "vitest";
import { TRIAL_DAYS, billingSummary, stripeTrialEnd, trialEndsAtFrom } from "./trial";

const NOW = new Date("2026-10-12T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

describe("trial", () => {
  it("runs 30 days from sign-up", () => {
    expect(TRIAL_DAYS).toBe(30);
    expect(trialEndsAtFrom(NOW).toISOString()).toBe("2026-11-11T12:00:00.000Z");
  });

  it("carries the rest of the trial into Stripe only when it is over 48 hours away", () => {
    expect(stripeTrialEnd(at(20), NOW)).toBe(Math.floor(at(20).getTime() / 1000));
    expect(stripeTrialEnd(at(3), NOW)).not.toBeNull();
    expect(stripeTrialEnd(at(1.9), NOW)).toBeNull();
    expect(stripeTrialEnd(at(-1), NOW)).toBeNull();
    expect(stripeTrialEnd(null, NOW)).toBeNull();
  });
});

describe("billingSummary", () => {
  const on = { stripeConfigured: true, now: NOW };

  it("shows days left during the trial and stays open", () => {
    const s = billingSummary({ subscriptionStatus: "trialing", trialEndsAt: at(12) }, on);
    expect(s).toMatchObject({ status: "trialing", gate: "writeable", trialDaysLeft: 12, locked: false, subscribed: false });
  });

  it("locks the admin pages after an unpaid trial ends", () => {
    const s = billingSummary({ subscriptionStatus: "trialing", trialEndsAt: at(-1) }, on);
    expect(s).toMatchObject({ status: "expired", gate: "readonly", locked: true });
  });

  it("never locks when the server has no Stripe keys, since nobody could pay", () => {
    const s = billingSummary({ subscriptionStatus: "trialing", trialEndsAt: at(-1) }, { stripeConfigured: false, now: NOW });
    expect(s.locked).toBe(false);
  });

  it("treats units made before self-serve sign-up (no trial end) as open", () => {
    const s = billingSummary({ subscriptionStatus: "trialing", trialEndsAt: null }, on);
    expect(s).toMatchObject({ status: "active", gate: "writeable", locked: false });
  });

  it("stays open for a paid unit and reports the renewal date", () => {
    const s = billingSummary(
      { subscriptionStatus: "active", stripeSubscriptionId: "sub_1", currentPeriodEnd: at(30), trialEndsAt: at(-5) },
      on,
    );
    expect(s).toMatchObject({ status: "active", subscribed: true, locked: false, currentPeriodEnd: at(30).toISOString() });
  });

  it("locks a canceled unit but not a suspended or demo one", () => {
    expect(billingSummary({ subscriptionStatus: "canceled" }, on).locked).toBe(true);
    expect(billingSummary({ subscriptionStatus: "canceled", suspendedAt: NOW }, on).locked).toBe(false);
    expect(billingSummary({ subscriptionStatus: "canceled", isDemo: true }, on).locked).toBe(false);
  });

  it("keeps a past-due unit open for the grace week", () => {
    expect(billingSummary({ subscriptionStatus: "past_due", currentPeriodEnd: at(-2) }, on).locked).toBe(false);
    expect(billingSummary({ subscriptionStatus: "past_due", currentPeriodEnd: at(-8) }, on).locked).toBe(true);
  });
});
