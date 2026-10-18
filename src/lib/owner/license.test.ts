import { describe, expect, it } from "vitest";
import { extendedTrialEnd, licenseFor } from "./license";

const NOW = new Date("2026-10-18T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

describe("licenseFor", () => {
  it("shows a trial with days left, warning in its last week", () => {
    expect(licenseFor({ subscriptionStatus: "trialing", trialEndsAt: at(20) }, NOW)).toMatchObject({ kind: "trial", tone: "info" });
    const l = licenseFor({ subscriptionStatus: "trialing", trialEndsAt: at(3) }, NOW);
    expect(l).toMatchObject({ kind: "trial", tone: "warn" });
    expect(l.detail).toMatch(/^3 days left/);
  });

  it("marks a trial that ran out without paying", () => {
    const l = licenseFor({ subscriptionStatus: "trialing", trialEndsAt: at(-5) }, NOW);
    expect(l.kind).toBe("trial_ended");
    expect(l.detail).toContain("5 days ago");
  });

  it("tells paying, canceling, past due and canceled apart", () => {
    const paid = { subscriptionStatus: "active", stripeSubscriptionId: "sub_1", currentPeriodEnd: at(200) };
    expect(licenseFor(paid, NOW).kind).toBe("paid");
    expect(licenseFor({ ...paid, cancelAtPeriodEnd: true }, NOW).kind).toBe("canceling");
    expect(licenseFor({ ...paid, subscriptionStatus: "past_due" }, NOW).kind).toBe("past_due");
    expect(licenseFor({ ...paid, subscriptionStatus: "canceled" }, NOW).kind).toBe("canceled");
  });

  it("free access wins over an ended trial, until its date", () => {
    const org = { subscriptionStatus: "trialing", trialEndsAt: at(-40), compedUntil: at(10), compedNote: "Den chief pilot" };
    const l = licenseFor(org, NOW);
    expect(l.kind).toBe("comped");
    expect(l.detail).toContain("Den chief pilot");
    expect(licenseFor({ ...org, compedUntil: at(-1) }, NOW).kind).toBe("trial_ended");
  });

  it("suspension and demo come first; units older than self-serve have no billing", () => {
    expect(licenseFor({ suspendedAt: at(-1), suspendedReason: "abuse", compedUntil: at(10) }, NOW).kind).toBe("suspended");
    expect(licenseFor({ isDemo: true, subscriptionStatus: "trialing", trialEndsAt: at(-1) }, NOW).kind).toBe("demo");
    expect(licenseFor({ subscriptionStatus: "trialing", trialEndsAt: null }, NOW).kind).toBe("legacy");
  });
});

describe("extendedTrialEnd", () => {
  it("adds to a running trial and restarts an ended one from today", () => {
    expect(extendedTrialEnd(at(5), 14, NOW)).toEqual(at(19));
    expect(extendedTrialEnd(at(-30), 14, NOW)).toEqual(at(14));
    expect(extendedTrialEnd(null, 7, NOW)).toEqual(at(7));
  });
});
