// Integration tests for the super-admin analytics dashboard at
// /__super/analytics. Seeds AuditLog rows directly (matching the
// shape lib/analytics.js#track writes) so we exercise the rollup
// helpers + the rendered HTML without driving the full beacon.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import { app } from "../../server/index.js";
import { prisma } from "../../lib/db.js";
import { getCsrf, mergeCookies, resetDb, signUpUser, TEST_ORG_SLUG } from "./_setup.js";

const request = supertest(app);

beforeAll(() => {
  delete process.env.ORIGIN_AUTH_SECRET;
});

/**
 * Sign up a user on the test org, then promote them to super-admin.
 * Returns the cookie jar to drive subsequent /__super requests.
 */
async function asSuperAdmin({ email = "ops@compass.invalid" } = {}) {
  const { cookie } = await signUpUser(request, {
    email,
    password: "this-is-a-strong-pw",
    displayName: "Operator",
  });
  await prisma.user.update({ where: { email }, data: { isSuperAdmin: true } });
  return cookie;
}

/**
 * Seed an AuditLog analytics row directly. Matches the shape of
 * lib/analytics.js#track output so the rollup helpers and the route
 * exercise the same parser path the beacon would.
 */
async function seedEvent({ orgId = null, action, dims, createdAt = new Date() }) {
  await prisma.auditLog.create({
    data: {
      orgId,
      userId: null,
      userDisplay: null,
      entityType: "Analytics",
      entityId: null,
      action: `analytics:${action}`,
      summary: JSON.stringify(dims || {}),
      createdAt,
    },
  });
}

describe("/__super/analytics", () => {
  beforeEach(resetDb);

  it("requires super-admin (anonymous → /login)", async () => {
    const r = await request.get("/__super/analytics").set("Host", "compass.app");
    expect([302, 401, 403]).toContain(r.status);
    if (r.status === 302) {
      expect(r.headers.location).toContain("/login.html");
    }
  });

  it("renders an empty-state view when there are no analytics rows", async () => {
    const cookie = await asSuperAdmin();
    const r = await request.get("/__super/analytics").set("Host", "compass.app").set("Cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.text).toContain("Analytics");
    expect(r.text).toMatch(/No page views in this window/i);
    expect(r.text).toMatch(/No tracked clicks in this window/i);
    expect(r.text).toMatch(/No client errors in this window/i);
    expect(r.text).toMatch(/No non-2xx fetches in this window/i);
  });

  it("aggregates page-views by surface and shows the right counts in the headline", async () => {
    const cookie = await asSuperAdmin();
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    // 4 marketing, 2 tenant (attributed to org), 1 admin.
    for (let i = 0; i < 4; i++) await seedEvent({ action: "page-view", dims: { surface: "marketing", path: "/" } });
    for (let i = 0; i < 2; i++) await seedEvent({ orgId: org.id, action: "page-view", dims: { surface: "tenant", path: "/" } });
    await seedEvent({ orgId: org.id, action: "page-view", dims: { surface: "admin", path: "/admin/index.html" } });

    const r = await request.get("/__super/analytics?window=7d").set("Host", "compass.app").set("Cookie", cookie);
    expect(r.status).toBe(200);
    // Headline page-views = 7.
    expect(r.text).toMatch(/Page views[\s\S]*?>7</);
    // Each surface bar shows its count.
    expect(r.text).toMatch(/Marketing \(apex\)[\s\S]*?>4/);
    expect(r.text).toMatch(/Tenant \(org subdomain\)[\s\S]*?>2/);
    expect(r.text).toMatch(/Admin \(\/admin\)[\s\S]*?>1/);
  });

  it("ranks paths by view count in 'Top paths' and limits to the active surface", async () => {
    const cookie = await asSuperAdmin();
    await seedEvent({ action: "page-view", dims: { surface: "marketing", path: "/plans.html" } });
    await seedEvent({ action: "page-view", dims: { surface: "marketing", path: "/plans.html" } });
    await seedEvent({ action: "page-view", dims: { surface: "marketing", path: "/plans.html" } });
    await seedEvent({ action: "page-view", dims: { surface: "marketing", path: "/positioning.html" } });
    await seedEvent({ action: "page-view", dims: { surface: "admin", path: "/admin/feedback.html" } });

    const r = await request.get("/__super/analytics?window=7d&surface=marketing").set("Host", "compass.app").set("Cookie", cookie);
    expect(r.text).toContain("/plans.html");
    expect(r.text).toContain("/positioning.html");
    // Admin path should NOT appear when surface=marketing.
    expect(r.text).not.toContain("/admin/feedback.html");
  });

  it("shows the most-clicked data-track labels with their counts", async () => {
    const cookie = await asSuperAdmin();
    for (let i = 0; i < 5; i++) {
      await seedEvent({ action: "element-clicked", dims: { surface: "marketing", path: "/", label: "hero-cta-start-trial" } });
    }
    for (let i = 0; i < 2; i++) {
      await seedEvent({ action: "element-clicked", dims: { surface: "marketing", path: "/", label: "footer-link-security" } });
    }

    const r = await request.get("/__super/analytics?window=7d").set("Host", "compass.app").set("Cookie", cookie);
    expect(r.text).toContain("hero-cta-start-trial");
    expect(r.text).toContain("footer-link-security");
    // The hero CTA appears before the footer link in the response —
    // ranking is by count desc.
    expect(r.text.indexOf("hero-cta-start-trial")).toBeLessThan(r.text.indexOf("footer-link-security"));
  });

  it("lists recent client-errors with message + surface + path", async () => {
    const cookie = await asSuperAdmin();
    await seedEvent({
      action: "client-error",
      dims: {
        surface: "admin",
        path: "/admin/calendar.html",
        kind: "error",
        message: "Cannot read properties of undefined (reading 'rsvps')",
        source: "https://compass.app/admin/scripts/calendar.js",
        line: 142,
        col: 18,
      },
    });

    const r = await request.get("/__super/analytics?window=7d").set("Host", "compass.app").set("Cookie", cookie);
    expect(r.text).toContain("Cannot read properties of undefined");
    expect(r.text).toContain("/admin/scripts/calendar.js");
    expect(r.text).toContain(":142");
    expect(r.text).toContain("/admin/calendar.html");
  });

  it("lists recent fetch-failures with status + URL", async () => {
    const cookie = await asSuperAdmin();
    await seedEvent({
      action: "fetch-failed",
      dims: {
        surface: "admin",
        path: "/admin/index.html",
        status: 500,
        url: "/api/v1/orgs/abc/dashboard",
      },
    });

    const r = await request.get("/__super/analytics?window=7d").set("Host", "compass.app").set("Cookie", cookie);
    expect(r.text).toContain("/api/v1/orgs/abc/dashboard");
    // 500 status renders with the warn tag.
    expect(r.text).toMatch(/tag tag-warn">500/);
  });

  it("ranks orgs by activity in 'Top orgs by activity'", async () => {
    const cookie = await asSuperAdmin();
    const orgA = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const orgB = await prisma.org.create({
      data: {
        slug: "busytroop",
        unitType: "Troop",
        unitNumber: "11",
        displayName: "Busy Troop",
        charterOrg: "x",
        city: "y",
        state: "Z",
        scoutmasterName: "z",
        scoutmasterEmail: "z@x.invalid",
      },
    });
    for (let i = 0; i < 4; i++) await seedEvent({ orgId: orgA.id, action: "page-view", dims: { surface: "tenant" } });
    for (let i = 0; i < 9; i++) await seedEvent({ orgId: orgB.id, action: "page-view", dims: { surface: "tenant" } });

    const r = await request.get("/__super/analytics?window=7d").set("Host", "compass.app").set("Cookie", cookie);
    expect(r.text).toContain("Busy Troop");
    expect(r.text).toContain("Test Troop 999");
    // Busy Troop ranks above Test Troop (9 > 4).
    expect(r.text.indexOf("Busy Troop")).toBeLessThan(r.text.indexOf("Test Troop 999"));
  });

  it("ignores rows older than the selected window", async () => {
    const cookie = await asSuperAdmin();
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
    const fresh = new Date(Date.now() - 1 * 60 * 60 * 1000);     // 1 hour ago
    await seedEvent({ action: "page-view", dims: { surface: "marketing", path: "/old" }, createdAt: old });
    await seedEvent({ action: "page-view", dims: { surface: "marketing", path: "/fresh" }, createdAt: fresh });

    const r7 = await request.get("/__super/analytics?window=7d").set("Host", "compass.app").set("Cookie", cookie);
    expect(r7.text).toContain("/fresh");
    expect(r7.text).not.toContain("/old");

    const r90 = await request.get("/__super/analytics?window=90d").set("Host", "compass.app").set("Cookie", cookie);
    expect(r90.text).toContain("/fresh");
    expect(r90.text).toContain("/old");
  });

  it("renders a sparkline div per day in the page-views-per-day card", async () => {
    const cookie = await asSuperAdmin();
    // 7 days back through today; one event per day.
    for (let d = 0; d < 7; d++) {
      const at = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
      await seedEvent({ action: "page-view", dims: { surface: "marketing", path: "/" }, createdAt: at });
    }
    const r = await request.get("/__super/analytics?window=7d").set("Host", "compass.app").set("Cookie", cookie);
    // 8 buckets (since spans inclusive: today + 7 days back).
    const bars = r.text.match(/<div title="\d{4}-\d{2}-\d{2} ·/g) || [];
    expect(bars.length).toBeGreaterThanOrEqual(7);
  });

  it("appears in the super-admin nav on every page", async () => {
    const cookie = await asSuperAdmin();
    const overview = await request.get("/__super").set("Host", "compass.app").set("Cookie", cookie);
    expect(overview.text).toContain('href="/__super/analytics"');
  });

  it("falls back to the default 7d window for unknown ?window= values", async () => {
    const cookie = await asSuperAdmin();
    const r = await request.get("/__super/analytics?window=banana").set("Host", "compass.app").set("Cookie", cookie);
    expect(r.status).toBe(200);
    // The 7d link is the active one in the nav row.
    expect(r.text).toMatch(/href="\/__super\/analytics\?window=7d"\s+class="tag tag-on">/);
  });

  it("renders the marketing funnel section with empty-state when there are no marketing views", async () => {
    const cookie = await asSuperAdmin();
    const r = await request.get("/__super/analytics").set("Host", "compass.app").set("Cookie", cookie);
    expect(r.text).toContain("Marketing funnel");
    expect(r.text).toMatch(/No marketing-surface page views in this window/i);
  });

  it("renders the marketing funnel with stage counts and an overall conversion %", async () => {
    const cookie = await asSuperAdmin();
    // 4 marketing views (1 of which is /signup), 2 CTA clicks, 1 signup.
    for (let i = 0; i < 3; i++) await seedEvent({ action: "page-view", dims: { surface: "marketing", path: "/" } });
    await seedEvent({ action: "page-view", dims: { surface: "marketing", path: "/signup.html" } });
    await seedEvent({ action: "element-clicked", dims: { surface: "marketing", label: "topnav-start-trial" } });
    await seedEvent({ action: "element-clicked", dims: { surface: "marketing", label: "hero-start-trial" } });
    await seedEvent({ action: "user-signed-up", dims: { plan: "troop" } });

    const r = await request.get("/__super/analytics?window=7d").set("Host", "compass.app").set("Cookie", cookie);
    expect(r.text).toContain("Marketing funnel");
    expect(r.text).toContain("Marketing page views");
    expect(r.text).toContain("CTA clicks");
    expect(r.text).toContain("/signup page view");
    expect(r.text).toContain("Account signups");
    // 4 / 2 / 1 / 1 in that visual order. The right-hand <td> on each
    // row carries the count with tabular-nums; we just match the four
    // counts in order in the funnel section.
    const tableRegion = r.text.split("Marketing funnel")[1].split("Top orgs by activity")[0];
    expect(tableRegion).toMatch(/tabular-nums">4</);
    expect(tableRegion).toMatch(/tabular-nums">2</);
    expect(tableRegion).toMatch(/tabular-nums">1</);
    // Overall conversion = 1 / 4 = 25%.
    expect(r.text).toMatch(/25\.00%/);
  });
});
