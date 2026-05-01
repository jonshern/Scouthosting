// Analytics contract tests.
//
// Compass deals with minors' data, so the analytics surface is small,
// whitelisted, and privacy-conscious. These tests pin: only known
// events get recorded; failures don't propagate; rollup aggregates
// correctly; dimension payload is bounded.

import { describe, it, expect } from "vitest";
import { EVENTS, track, rollup } from "../lib/analytics.js";

function fakePrisma() {
  const rows = [];
  return {
    _rows: rows,
    auditLog: {
      create: async ({ data }) => {
        rows.push({ id: `r${rows.length}`, createdAt: new Date(), ...data });
        return rows[rows.length - 1];
      },
      groupBy: async ({ by, where }) => {
        const filtered = rows.filter((r) => {
          if (where.orgId && r.orgId !== where.orgId) return false;
          if (where.action?.startsWith && !r.action.startsWith(where.action.startsWith)) return false;
          if (where.createdAt?.gte && r.createdAt < where.createdAt.gte) return false;
          if (where.createdAt?.lte && r.createdAt > where.createdAt.lte) return false;
          return true;
        });
        const buckets = new Map();
        for (const r of filtered) {
          const key = r[by[0]];
          buckets.set(key, (buckets.get(key) || 0) + 1);
        }
        return [...buckets.entries()].map(([action, count]) => ({
          action,
          _count: { _all: count },
        }));
      },
    },
  };
}

describe("track", () => {
  it("records an AuditLog row prefixed analytics:", async () => {
    const prisma = fakePrisma();
    await track(EVENTS.RSVP_SUBMITTED, { orgId: "o1", userId: "u1", dimensions: { eventId: "e1" } }, prisma);
    expect(prisma._rows).toHaveLength(1);
    expect(prisma._rows[0].action).toBe("analytics:rsvp-submitted");
    expect(prisma._rows[0].entityType).toBe("Analytics");
    expect(JSON.parse(prisma._rows[0].summary)).toEqual({ eventId: "e1" });
  });

  it("ignores unknown event names (the whitelist is intentional)", async () => {
    const prisma = fakePrisma();
    await track("hacker-event", { orgId: "o1" }, prisma);
    expect(prisma._rows).toEqual([]);
  });

  it("does not propagate persistence failures (best-effort semantics)", async () => {
    const prisma = {
      auditLog: {
        create: () => Promise.reject(new Error("DB down")),
      },
    };
    await expect(track(EVENTS.PAGE_VIEW, { orgId: "o1" }, prisma)).resolves.toBeUndefined();
  });

  it("truncates oversized dimension payloads to keep AuditLog.summary bounded", async () => {
    const prisma = fakePrisma();
    const big = "x".repeat(600);
    await track(EVENTS.PAGE_VIEW, { orgId: "o1", dimensions: { big } }, prisma);
    expect(prisma._rows[0].summary.length).toBeLessThanOrEqual(500);
  });

  it("accepts a null orgId for apex-level events (signup, marketing pageview)", async () => {
    const prisma = fakePrisma();
    await track(EVENTS.USER_SIGNED_UP, { orgId: null, dimensions: { plan: "patrol" } }, prisma);
    expect(prisma._rows[0].orgId).toBeNull();
  });
});

describe("rollup", () => {
  it("aggregates events by name and sorts descending", async () => {
    const prisma = fakePrisma();
    const orgId = "o1";
    await track(EVENTS.PAGE_VIEW, { orgId }, prisma);
    await track(EVENTS.PAGE_VIEW, { orgId }, prisma);
    await track(EVENTS.PAGE_VIEW, { orgId }, prisma);
    await track(EVENTS.RSVP_SUBMITTED, { orgId }, prisma);
    const result = await rollup({ orgId, since: new Date(0) }, prisma);
    expect(result[0]).toEqual({ event: "page-view", count: 3 });
    expect(result[1]).toEqual({ event: "rsvp-submitted", count: 1 });
  });

  it("respects the time window (events outside are excluded)", async () => {
    const prisma = fakePrisma();
    const orgId = "o1";
    await track(EVENTS.PAGE_VIEW, { orgId }, prisma);
    prisma._rows[0].createdAt = new Date("2025-01-01");
    await track(EVENTS.PAGE_VIEW, { orgId }, prisma);
    prisma._rows[1].createdAt = new Date("2026-05-01");
    const result = await rollup(
      { orgId, since: new Date("2026-01-01"), until: new Date("2026-12-31") },
      prisma,
    );
    expect(result).toEqual([{ event: "page-view", count: 1 }]);
  });

  it("filters by orgId so one org's stats don't leak into another's", async () => {
    const prisma = fakePrisma();
    await track(EVENTS.PAGE_VIEW, { orgId: "o1" }, prisma);
    await track(EVENTS.PAGE_VIEW, { orgId: "o2" }, prisma);
    const result = await rollup({ orgId: "o1", since: new Date(0) }, prisma);
    expect(result).toEqual([{ event: "page-view", count: 1 }]);
  });
});
