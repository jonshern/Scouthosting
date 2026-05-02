// Pure-functional tests for lib/billingState.js. No DB / no Stripe SDK.

import { describe, it, expect } from "vitest";
import { deriveBillingStatus, canWrite, billingBanner } from "../lib/billingState.js";

const NOW = new Date("2026-05-02T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

function org(overrides = {}) {
  return {
    id: "o1",
    isDemo: false,
    suspendedAt: null,
    suspendedReason: null,
    subscriptionStatus: "trialing",
    trialEndsAt: new Date(NOW.getTime() + 30 * day),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

describe("deriveBillingStatus", () => {
  it("treats demo orgs as always writeable", () => {
    const s = deriveBillingStatus(org({ isDemo: true, subscriptionStatus: "expired" }), NOW);
    expect(s.gate).toBe("writeable");
    expect(s.status).toBe("active");
  });

  it("suspended overrides everything", () => {
    const s = deriveBillingStatus(org({ suspendedAt: NOW, suspendedReason: "abuse" }), NOW);
    expect(s.gate).toBe("suspended");
    expect(s.status).toBe("suspended");
    expect(s.reason).toBe("abuse");
  });

  it("trialing with days left → writeable + days left", () => {
    const s = deriveBillingStatus(org({ trialEndsAt: new Date(NOW.getTime() + 5 * day) }), NOW);
    expect(s.gate).toBe("writeable");
    expect(s.status).toBe("trialing");
    expect(s.trialDaysLeft).toBe(5);
  });

  it("trial expired → readonly + expired", () => {
    const s = deriveBillingStatus(org({ trialEndsAt: new Date(NOW.getTime() - day) }), NOW);
    expect(s.gate).toBe("readonly");
    expect(s.status).toBe("expired");
  });

  it("trialing with no end date → fail closed", () => {
    const s = deriveBillingStatus(org({ trialEndsAt: null }), NOW);
    expect(s.gate).toBe("readonly");
    expect(s.reason).toBe("trial_misconfigured");
  });

  it("active → writeable", () => {
    const s = deriveBillingStatus(
      org({ subscriptionStatus: "active", trialEndsAt: null }),
      NOW,
    );
    expect(s.gate).toBe("writeable");
    expect(s.status).toBe("active");
  });

  it("past_due within 7-day grace → writeable", () => {
    const s = deriveBillingStatus(
      org({
        subscriptionStatus: "past_due",
        currentPeriodEnd: new Date(NOW.getTime() - 2 * day),
      }),
      NOW,
    );
    expect(s.gate).toBe("writeable");
    expect(s.inGrace).toBe(true);
  });

  it("past_due past grace → readonly", () => {
    const s = deriveBillingStatus(
      org({
        subscriptionStatus: "past_due",
        currentPeriodEnd: new Date(NOW.getTime() - 10 * day),
      }),
      NOW,
    );
    expect(s.gate).toBe("readonly");
    expect(s.inGrace).toBe(false);
  });

  it("canceled → readonly", () => {
    const s = deriveBillingStatus(org({ subscriptionStatus: "canceled" }), NOW);
    expect(s.gate).toBe("readonly");
    expect(s.status).toBe("canceled");
  });

  it("unknown status → fail closed", () => {
    const s = deriveBillingStatus(org({ subscriptionStatus: "weird" }), NOW);
    expect(s.gate).toBe("readonly");
    expect(s.reason).toBe("unknown_status");
  });

  it("null org → readonly", () => {
    const s = deriveBillingStatus(null, NOW);
    expect(s.gate).toBe("readonly");
  });
});

describe("canWrite", () => {
  it("matches the gate from deriveBillingStatus", () => {
    expect(canWrite(org({ subscriptionStatus: "active" }), NOW)).toBe(true);
    expect(canWrite(org({ subscriptionStatus: "canceled" }), NOW)).toBe(false);
  });
});

describe("billingBanner", () => {
  it("returns null when active", () => {
    const s = deriveBillingStatus(org({ subscriptionStatus: "active" }), NOW);
    expect(billingBanner(s)).toBeNull();
  });

  it("warns when trial has 7 days or fewer", () => {
    const s = deriveBillingStatus(org({ trialEndsAt: new Date(NOW.getTime() + 3 * day) }), NOW);
    const b = billingBanner(s);
    expect(b.tone).toBe("warn");
    expect(b.headline).toContain("3");
  });

  it("info banner when trial has more than 7 days", () => {
    const s = deriveBillingStatus(org({ trialEndsAt: new Date(NOW.getTime() + 30 * day) }), NOW);
    const b = billingBanner(s);
    expect(b.tone).toBe("info");
  });

  it("danger banner when expired", () => {
    const s = deriveBillingStatus(org({ trialEndsAt: new Date(NOW.getTime() - day) }), NOW);
    const b = billingBanner(s);
    expect(b.tone).toBe("danger");
  });
});
