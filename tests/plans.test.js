// Plan-gating helpers + middleware. The middleware doesn't yet gate
// any live routes — this PR ships the plumbing so future business
// decisions about plan tiers can wire features behind it without
// reworking the foundation.

import { describe, it, expect } from "vitest";
import {
  PLAN_FEATURES,
  planLabel,
  planRank,
  planIncludes,
  requirePlanFeature,
} from "../lib/plans.js";

describe("planRank", () => {
  it("ranks patrol < troop < council", () => {
    expect(planRank("patrol")).toBeLessThan(planRank("troop"));
    expect(planRank("troop")).toBeLessThan(planRank("council"));
  });

  it("returns -1 for unknown plans (fail closed at planIncludes)", () => {
    expect(planRank("enterprise")).toBe(-1);
    expect(planRank(null)).toBe(-1);
  });
});

describe("planLabel", () => {
  it("returns the human-readable label", () => {
    expect(planLabel("patrol")).toBe("Patrol");
    expect(planLabel("troop")).toBe("Troop");
    expect(planLabel("council")).toBe("Council");
  });

  it("falls back to the raw plan key when unknown", () => {
    expect(planLabel("custom")).toBe("custom");
  });
});

describe("planIncludes", () => {
  it("throws on unknown feature key (loud failure during dev)", () => {
    expect(() => planIncludes({ plan: "patrol" }, "nope.fake")).toThrow(/Unknown plan feature/);
  });

  it("returns false for null org (fail closed)", () => {
    expect(planIncludes(null, "newsletter.scheduler")).toBe(false);
  });

  it("demo orgs bypass — every feature included regardless of plan", () => {
    const demo = { plan: "patrol", isDemo: true };
    expect(planIncludes(demo, "newsletter.scheduler")).toBe(true);
    expect(planIncludes(demo, "council.rollup")).toBe(true);
  });

  it("matches the feature's minimum tier", () => {
    expect(planIncludes({ plan: "troop" }, "newsletter.scheduler")).toBe(true);
    expect(planIncludes({ plan: "patrol" }, "newsletter.scheduler")).toBe(false);
  });

  it("higher tier includes lower-tier features", () => {
    expect(planIncludes({ plan: "council" }, "newsletter.scheduler")).toBe(true);
    expect(planIncludes({ plan: "council" }, "domain.custom")).toBe(true);
  });

  it("council-only feature blocks lower tiers", () => {
    expect(planIncludes({ plan: "patrol" }, "council.rollup")).toBe(false);
    expect(planIncludes({ plan: "troop" }, "council.rollup")).toBe(false);
    expect(planIncludes({ plan: "council" }, "council.rollup")).toBe(true);
  });
});

describe("requirePlanFeature middleware", () => {
  function fakeRes() {
    return {
      statusCode: 200,
      body: "",
      type() { return this; },
      status(c) { this.statusCode = c; return this; },
      send(b) { this.body = b; return this; },
    };
  }

  it("throws at construction time for an unknown feature key", () => {
    expect(() => requirePlanFeature("nope.fake")).toThrow(/unknown feature/);
  });

  it("calls next() when the org's plan includes the feature", () => {
    const gate = requirePlanFeature("newsletter.scheduler");
    let called = false;
    gate({ org: { plan: "troop", displayName: "Troop 1" } }, fakeRes(), () => { called = true; });
    expect(called).toBe(true);
  });

  it("renders the upgrade page (HTTP 402) when the plan is too low", () => {
    const gate = requirePlanFeature("newsletter.scheduler");
    const res = fakeRes();
    let called = false;
    gate(
      { org: { plan: "patrol", displayName: "Pack 100", isDemo: false } },
      res,
      () => { called = true; },
    );
    expect(called).toBe(false);
    expect(res.statusCode).toBe(402);
    expect(res.body).toContain("upgrade required");
    expect(res.body).toContain("Newsletter scheduler");
    expect(res.body).toContain("Pack 100");
    expect(res.body).toContain("Troop"); // the required tier label
  });

  it("404s when no org is resolved (apex / unknown subdomain)", () => {
    const gate = requirePlanFeature("newsletter.scheduler");
    const res = fakeRes();
    gate({ org: null }, res, () => {});
    expect(res.statusCode).toBe(404);
  });

  it("demo orgs bypass — middleware passes through", () => {
    const gate = requirePlanFeature("council.rollup");
    let called = false;
    gate(
      { org: { plan: "patrol", isDemo: true, displayName: "Demo" } },
      fakeRes(),
      () => { called = true; },
    );
    expect(called).toBe(true);
  });
});

describe("PLAN_FEATURES catalog", () => {
  it("every entry declares a known minTier", () => {
    for (const [key, meta] of Object.entries(PLAN_FEATURES)) {
      expect(meta.minTier, `${key} missing minTier`).toBeDefined();
      expect(["patrol", "troop", "council"]).toContain(meta.minTier);
    }
  });

  it("every entry declares a human label for the upgrade page", () => {
    for (const [key, meta] of Object.entries(PLAN_FEATURES)) {
      expect(meta.label, `${key} missing label`).toBeTruthy();
    }
  });

  it("is frozen so the catalog can't drift at runtime", () => {
    expect(Object.isFrozen(PLAN_FEATURES)).toBe(true);
  });
});
