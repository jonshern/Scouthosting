// Integration tests for the per-org admin analytics dashboard at
// /admin/analytics. Same shape as /__super/analytics but org-scoped:
// the leader sees only their own unit's traffic and errors.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import { app } from "../../server/index.js";
import { prisma } from "../../lib/db.js";
import { resetDb, signUpUser, TEST_ORG_SLUG } from "./_setup.js";

const request = supertest(app);
const HOST = `${TEST_ORG_SLUG}.localhost`;

beforeAll(() => {
  delete process.env.ORIGIN_AUTH_SECRET;
});

/**
 * Sign up a user and grant them the leader role on the test org.
 * Returns the cookie jar.
 */
async function asLeader({ email = "leader@compass.invalid" } = {}) {
  const { cookie } = await signUpUser(request, {
    email,
    password: "this-is-a-strong-pw",
    displayName: "Leader L",
  });
  const user = await prisma.user.findUnique({ where: { email } });
  const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
    update: { role: "leader" },
    create: { userId: user.id, orgId: org.id, role: "leader" },
  });
  return cookie;
}

async function seedEvent({ orgId, action, dims, createdAt = new Date() }) {
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

describe("/admin/analytics", () => {
  beforeEach(resetDb);

  it("redirects anonymous visitors to /admin/login", async () => {
    const r = await request.get("/admin/analytics").set("Host", HOST);
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe("/admin/login");
  });

  it("renders the dashboard for a leader (with empty-state messaging)", async () => {
    const cookie = await asLeader();
    const r = await request.get("/admin/analytics").set("Host", HOST).set("Cookie", cookie);
    expect(r.status).toBe(200);
    // Section title.
    expect(r.text).toMatch(/<h1[^>]*>\s*Analytics\s*<\/h1>/);
    // The org's display name shows in the lede so the leader knows
    // the dashboard is scoped to them, not aggregate.
    expect(r.text).toContain("Test Troop 999");
    expect(r.text).toMatch(/No client errors in this window/i);
  });

  it("scopes results to the leader's org (cross-org events do not leak in)", async () => {
    const cookie = await asLeader();
    const orgA = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const orgB = await prisma.org.create({
      data: {
        slug: "otherorg",
        unitType: "Troop",
        unitNumber: "12",
        displayName: "Other Org",
        charterOrg: "x",
        city: "y",
        state: "Z",
        scoutmasterName: "z",
        scoutmasterEmail: "z@x.invalid",
      },
    });
    await seedEvent({ orgId: orgA.id, action: "page-view", dims: { surface: "tenant", path: "/orgA-page" } });
    await seedEvent({ orgId: orgB.id, action: "page-view", dims: { surface: "tenant", path: "/orgB-page" } });

    const r = await request.get("/admin/analytics").set("Host", HOST).set("Cookie", cookie);
    expect(r.text).toContain("/orgA-page");
    expect(r.text).not.toContain("/orgB-page");
  });

  it("does not surface marketing (apex) traffic — only tenant + admin", async () => {
    const cookie = await asLeader();
    // The picker UI lists 'all', 'public site', 'admin' — no marketing.
    const r = await request.get("/admin/analytics").set("Host", HOST).set("Cookie", cookie);
    expect(r.text).toMatch(/public site/i);
    // 'admin' surface link is present (the chip).
    expect(r.text).toMatch(/href="\/admin\/analytics\?window=[^"]+&surface=admin"/);
    // Marketing surface chip is not in the picker (apex traffic isn't
    // org-scoped so leaders shouldn't be filtering by it).
    expect(r.text).not.toMatch(/href="\/admin\/analytics\?window=[^"]+&surface=marketing"/);
  });

  it("counts page-views by surface (tenant vs admin) in the breakdown card", async () => {
    const cookie = await asLeader();
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    for (let i = 0; i < 3; i++) await seedEvent({ orgId: org.id, action: "page-view", dims: { surface: "tenant", path: "/" } });
    for (let i = 0; i < 5; i++) await seedEvent({ orgId: org.id, action: "page-view", dims: { surface: "admin", path: "/admin" } });
    const r = await request.get("/admin/analytics").set("Host", HOST).set("Cookie", cookie);
    expect(r.text).toMatch(/Public site \(families\)[\s\S]*?>3</);
    expect(r.text).toMatch(/Admin \(leaders\)[\s\S]*?>5</);
  });

  it("ranks the org's top click labels in the 'Top clicks' table", async () => {
    const cookie = await asLeader();
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    for (let i = 0; i < 4; i++) {
      await seedEvent({ orgId: org.id, action: "element-clicked", dims: { surface: "admin", label: "dash-new-event" } });
    }
    for (let i = 0; i < 2; i++) {
      await seedEvent({ orgId: org.id, action: "element-clicked", dims: { surface: "admin", label: "dash-send-reminder" } });
    }
    const r = await request.get("/admin/analytics").set("Host", HOST).set("Cookie", cookie);
    expect(r.text).toContain("dash-new-event");
    expect(r.text).toContain("dash-send-reminder");
    expect(r.text.indexOf("dash-new-event")).toBeLessThan(r.text.indexOf("dash-send-reminder"));
  });

  it("lists recent client-errors scoped to this org only", async () => {
    const cookie = await asLeader();
    const orgA = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const orgB = await prisma.org.create({
      data: {
        slug: "otherorg",
        unitType: "Troop",
        unitNumber: "12",
        displayName: "Other Org",
        charterOrg: "x",
        city: "y",
        state: "Z",
        scoutmasterName: "z",
        scoutmasterEmail: "z@x.invalid",
      },
    });
    await seedEvent({
      orgId: orgA.id,
      action: "client-error",
      dims: { surface: "admin", path: "/admin", message: "ours-error" },
    });
    await seedEvent({
      orgId: orgB.id,
      action: "client-error",
      dims: { surface: "admin", path: "/admin", message: "theirs-error" },
    });
    const r = await request.get("/admin/analytics").set("Host", HOST).set("Cookie", cookie);
    expect(r.text).toContain("ours-error");
    expect(r.text).not.toContain("theirs-error");
  });

  it("falls back to the default 30d window for unknown ?window= values", async () => {
    const cookie = await asLeader();
    const r = await request.get("/admin/analytics?window=banana").set("Host", HOST).set("Cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/href="\/admin\/analytics\?window=30d"\s+class="tag tag-on">/);
  });

  it("falls back to all-surfaces when ?surface= is invalid (e.g. 'marketing')", async () => {
    const cookie = await asLeader();
    const r = await request.get("/admin/analytics?surface=marketing").set("Host", HOST).set("Cookie", cookie);
    // 'all' chip is the active one.
    expect(r.text).toMatch(/href="\/admin\/analytics\?window=30d"\s+class="tag tag-on">all</);
  });

  it("rolls up org-scoped server events (e.g. user-signed-up) under 'Server events'", async () => {
    const cookie = await asLeader();
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    await seedEvent({ orgId: org.id, action: "user-signed-up", dims: { plan: "troop" } });
    await seedEvent({ orgId: org.id, action: "rsvp-submitted", dims: {} });
    const r = await request.get("/admin/analytics").set("Host", HOST).set("Cookie", cookie);
    expect(r.text).toContain("Server events");
    expect(r.text).toContain("user-signed-up");
    expect(r.text).toContain("rsvp-submitted");
  });
});
