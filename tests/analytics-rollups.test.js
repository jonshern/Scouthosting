// Unit tests for the new rollup helpers in lib/analytics.js.
//
// We don't talk to a real DB here; instead we fake a Prisma client
// that returns fixture rows shaped like what the analytics:* AuditLog
// records actually look like. This keeps the rollup logic itself
// (parsing, grouping, sorting, surface filtering) covered by fast
// unit tests separate from the integration suite that hits the route.

import { describe, it, expect } from "vitest";
import {
  summarize,
  topPaths,
  topClicks,
  recentErrors,
  recentFetchFails,
  pageViewsByDay,
  topOrgs,
  marketingFunnel,
} from "../lib/analytics.js";

function fakePrisma({ auditRows = [], orgRows = [] } = {}) {
  return {
    auditLog: {
      async findMany({ where, select, orderBy, take } = {}) {
        let rows = auditRows.filter((r) => matches(r, where));
        if (orderBy) {
          const k = Object.keys(orderBy)[0];
          const dir = orderBy[k] === "desc" ? -1 : 1;
          rows = [...rows].sort((a, b) => (a[k] > b[k] ? dir : a[k] < b[k] ? -dir : 0));
        }
        if (take) rows = rows.slice(0, take);
        if (select) rows = rows.map((r) => Object.fromEntries(Object.keys(select).map((k) => [k, r[k]])));
        return rows;
      },
      async count({ where } = {}) {
        return auditRows.filter((r) => matches(r, where)).length;
      },
      async groupBy({ by, where, _count, orderBy, take }) {
        const filtered = auditRows.filter((r) => matches(r, where));
        const buckets = new Map();
        for (const row of filtered) {
          const key = JSON.stringify(by.map((k) => row[k]));
          if (!buckets.has(key)) buckets.set(key, { ...Object.fromEntries(by.map((k) => [k, row[k]])), _count: { _all: 0, [by[0]]: 0 } });
          const b = buckets.get(key);
          b._count._all += 1;
          for (const k of by) b._count[k] = b._count._all;
        }
        let arr = [...buckets.values()];
        if (orderBy && _count) {
          const k = Object.keys(orderBy._count || {})[0];
          const desc = orderBy._count[k] === "desc";
          arr.sort((a, b) => desc ? (b._count._all - a._count._all) : (a._count._all - b._count._all));
        }
        if (take) arr = arr.slice(0, take);
        return arr;
      },
    },
    org: {
      async findMany({ where }) {
        const ids = where?.id?.in || [];
        return orgRows.filter((o) => ids.includes(o.id));
      },
    },
  };
}

function matches(row, where) {
  if (!where) return true;
  if (where.action !== undefined) {
    if (typeof where.action === "string") {
      if (row.action !== where.action) return false;
    } else if (where.action && typeof where.action === "object") {
      // Prisma operator form: { startsWith: "analytics:" }
      if (where.action.startsWith && !row.action.startsWith(where.action.startsWith)) return false;
      if (where.action.equals && row.action !== where.action.equals) return false;
    }
  }
  if (where.orgId !== undefined) {
    if (where.orgId === null) {
      if (row.orgId !== null) return false;
    } else if (typeof where.orgId === "string") {
      if (row.orgId !== where.orgId) return false;
    } else if (where.orgId && typeof where.orgId === "object") {
      if (where.orgId.not !== undefined && where.orgId.not === null && row.orgId === null) return false;
      if (Array.isArray(where.orgId.in) && !where.orgId.in.includes(row.orgId)) return false;
    }
  }
  if (where.createdAt) {
    if (where.createdAt.gte && row.createdAt < where.createdAt.gte) return false;
    if (where.createdAt.lte && row.createdAt > where.createdAt.lte) return false;
  }
  return true;
}

function row(action, dims, { createdAt = new Date(), orgId = null, id = String(Math.random()) } = {}) {
  return {
    id,
    orgId,
    userId: null,
    action: `analytics:${action}`,
    summary: JSON.stringify(dims || {}),
    createdAt,
  };
}

describe("summarize()", () => {
  it("counts page-views, clicks, errors, fetch-fails, signups", async () => {
    const prisma = fakePrisma({
      auditRows: [
        row("page-view", { surface: "marketing", path: "/" }),
        row("page-view", { surface: "marketing", path: "/plans.html" }),
        row("page-view", { surface: "tenant", path: "/" }),
        row("element-clicked", { surface: "marketing", label: "cta-start" }),
        row("client-error", { surface: "admin", message: "boom" }),
        row("fetch-failed", { surface: "admin", status: 500, url: "/x" }),
        row("user-signed-up", { plan: "troop" }),
      ],
    });
    const s = await summarize({ since: new Date(0) }, prisma);
    expect(s.totals).toEqual({
      events: 7,
      pageViews: 3,
      clicks: 1,
      errors: 1,
      fetchFails: 1,
      signups: 1,
    });
    expect(s.pageViewsBySurface).toEqual({ marketing: 2, tenant: 1, admin: 0, unknown: 0 });
  });

  it("attributes page-views with no surface dim to 'unknown'", async () => {
    const prisma = fakePrisma({
      auditRows: [row("page-view", { path: "/" })], // no surface
    });
    const s = await summarize({ since: new Date(0) }, prisma);
    expect(s.pageViewsBySurface.unknown).toBe(1);
  });

  it("returns zero totals when no events match", async () => {
    const s = await summarize({ since: new Date(0) }, fakePrisma());
    expect(s.totals).toEqual({ events: 0, pageViews: 0, clicks: 0, errors: 0, fetchFails: 0, signups: 0 });
  });
});

describe("topPaths()", () => {
  it("ranks paths by count desc and limits results", async () => {
    const rows = [];
    for (let i = 0; i < 5; i++) rows.push(row("page-view", { surface: "marketing", path: "/plans.html" }));
    for (let i = 0; i < 3; i++) rows.push(row("page-view", { surface: "marketing", path: "/positioning.html" }));
    for (let i = 0; i < 2; i++) rows.push(row("page-view", { surface: "marketing", path: "/" }));
    const top = await topPaths({ since: new Date(0), limit: 2 }, fakePrisma({ auditRows: rows }));
    expect(top).toEqual([
      { path: "/plans.html", count: 5 },
      { path: "/positioning.html", count: 3 },
    ]);
  });

  it("filters to a single surface when requested", async () => {
    const rows = [
      row("page-view", { surface: "marketing", path: "/m" }),
      row("page-view", { surface: "tenant", path: "/t" }),
      row("page-view", { surface: "admin", path: "/a" }),
    ];
    const top = await topPaths({ since: new Date(0), surface: "tenant" }, fakePrisma({ auditRows: rows }));
    expect(top).toEqual([{ path: "/t", count: 1 }]);
  });
});

describe("topClicks()", () => {
  it("ranks data-track labels by click count", async () => {
    const rows = [
      row("element-clicked", { surface: "marketing", label: "a" }),
      row("element-clicked", { surface: "marketing", label: "a" }),
      row("element-clicked", { surface: "marketing", label: "b" }),
      row("element-clicked", { surface: "marketing" }), // no label — skipped
    ];
    const top = await topClicks({ since: new Date(0) }, fakePrisma({ auditRows: rows }));
    expect(top).toEqual([
      { label: "a", count: 2 },
      { label: "b", count: 1 },
    ]);
  });
});

describe("recentErrors()", () => {
  it("returns errors newest-first with parsed dims", async () => {
    const rows = [
      row("client-error", { surface: "admin", message: "old", source: "x.js", line: 1 }, { createdAt: new Date(2020, 0, 1) }),
      row("client-error", { surface: "admin", message: "new", source: "y.js", line: 2 }, { createdAt: new Date(2026, 0, 1) }),
    ];
    const recent = await recentErrors({ since: new Date(0), limit: 5 }, fakePrisma({ auditRows: rows }));
    expect(recent[0].message).toBe("new");
    expect(recent[1].message).toBe("old");
  });

  it("recovers dimensions from a truncated summary (the '...' tail case)", async () => {
    // Mimic what serialiseDimensions emits for an over-500-char payload.
    const truncated = '{"surface":"admin","path":"/x","message":"oh no","stack":"line\\nline\\nline...';
    const rows = [{
      id: "1",
      orgId: null,
      userId: null,
      action: "analytics:client-error",
      summary: truncated,
      createdAt: new Date(),
    }];
    const recent = await recentErrors({ since: new Date(0) }, fakePrisma({ auditRows: rows }));
    expect(recent[0].message).toBe("oh no");
    expect(recent[0].surface).toBe("admin");
  });
});

describe("recentFetchFails()", () => {
  it("returns the captured status + url", async () => {
    const rows = [
      row("fetch-failed", { surface: "admin", status: 500, url: "/api/v1/x" }),
      row("fetch-failed", { surface: "tenant", status: 404, url: "/api/v1/y" }),
    ];
    const fails = await recentFetchFails({ since: new Date(0) }, fakePrisma({ auditRows: rows }));
    expect(fails.map((f) => f.status).sort()).toEqual([404, 500]);
    expect(fails.map((f) => f.url).sort()).toEqual(["/api/v1/x", "/api/v1/y"]);
  });
});

describe("pageViewsByDay()", () => {
  it("buckets by ISO date", async () => {
    const day1 = new Date(Date.UTC(2026, 4, 1, 10, 0, 0));
    const day2 = new Date(Date.UTC(2026, 4, 2, 10, 0, 0));
    const rows = [
      row("page-view", { surface: "marketing" }, { createdAt: day1 }),
      row("page-view", { surface: "marketing" }, { createdAt: day1 }),
      row("page-view", { surface: "marketing" }, { createdAt: day2 }),
    ];
    const out = await pageViewsByDay({ since: new Date(0) }, fakePrisma({ auditRows: rows }));
    expect(out).toEqual([
      { day: "2026-05-01", count: 2 },
      { day: "2026-05-02", count: 1 },
    ]);
  });
});

describe("topOrgs()", () => {
  it("ranks orgs by event volume, joining displayName/slug/plan", async () => {
    const orgRows = [
      { id: "org-A", slug: "alpha", displayName: "Alpha Troop", plan: "troop" },
      { id: "org-B", slug: "beta", displayName: "Beta Troop", plan: "patrol" },
    ];
    const rows = [
      row("page-view", { surface: "tenant" }, { orgId: "org-A" }),
      row("page-view", { surface: "tenant" }, { orgId: "org-A" }),
      row("page-view", { surface: "tenant" }, { orgId: "org-A" }),
      row("page-view", { surface: "tenant" }, { orgId: "org-B" }),
      row("page-view", { surface: "marketing" }, { orgId: null }), // skipped
    ];
    const top = await topOrgs({ since: new Date(0) }, fakePrisma({ auditRows: rows, orgRows }));
    expect(top).toHaveLength(2);
    expect(top[0].orgId).toBe("org-A");
    expect(top[0].count).toBe(3);
    expect(top[0].org.displayName).toBe("Alpha Troop");
    expect(top[1].orgId).toBe("org-B");
  });

  it("returns an empty array when there are no org-attributed events", async () => {
    const rows = [row("page-view", { surface: "marketing" }, { orgId: null })];
    const top = await topOrgs({ since: new Date(0) }, fakePrisma({ auditRows: rows }));
    expect(top).toEqual([]);
  });
});

describe("marketingFunnel()", () => {
  it("counts views, CTA clicks, /signup views, and signups in order", async () => {
    const rows = [
      // 4 marketing page views, 1 of which is /signup.html
      row("page-view", { surface: "marketing", path: "/" }),
      row("page-view", { surface: "marketing", path: "/plans.html" }),
      row("page-view", { surface: "marketing", path: "/" }),
      row("page-view", { surface: "marketing", path: "/signup.html" }),
      // tenant view doesn't count
      row("page-view", { surface: "tenant", path: "/" }),
      // 2 marketing-surface CTA clicks (with labels)
      row("element-clicked", { surface: "marketing", label: "topnav-start-trial" }),
      row("element-clicked", { surface: "marketing", label: "hero-start-trial" }),
      // unlabelled clicks don't count
      row("element-clicked", { surface: "marketing" }),
      // 1 signup
      row("user-signed-up", { plan: "troop" }),
    ];
    const f = await marketingFunnel({ since: new Date(0) }, fakePrisma({ auditRows: rows }));
    expect(f.stages.map((s) => s.count)).toEqual([4, 2, 1, 1]);
    // First stage has no conversion; subsequent ones are ratios.
    expect(f.stages[0].conversion).toBeNull();
    expect(f.stages[1].conversion).toBeCloseTo(2 / 4);
    expect(f.stages[2].conversion).toBeCloseTo(1 / 2);
    expect(f.stages[3].conversion).toBeCloseTo(1 / 1);
    expect(f.overall).toBeCloseTo(1 / 4);
  });

  it("returns null conversion + null overall when there are no marketing views", async () => {
    const f = await marketingFunnel({ since: new Date(0) }, fakePrisma({ auditRows: [] }));
    expect(f.stages.map((s) => s.count)).toEqual([0, 0, 0, 0]);
    expect(f.stages[1].conversion).toBeNull();
    expect(f.overall).toBeNull();
  });

  it("matches /signup with or without the .html suffix and trailing query", async () => {
    const rows = [
      row("page-view", { surface: "marketing", path: "/signup" }),
      row("page-view", { surface: "marketing", path: "/signup.html" }),
      row("page-view", { surface: "marketing", path: "/signup?next=%2Fplans" }),
      row("page-view", { surface: "marketing", path: "/signup#confirm" }),
      // not a match
      row("page-view", { surface: "marketing", path: "/signups" }),
    ];
    const f = await marketingFunnel({ since: new Date(0) }, fakePrisma({ auditRows: rows }));
    expect(f.stages[0].count).toBe(5); // total marketing views
    expect(f.stages[2].count).toBe(4); // /signup views
  });
});
