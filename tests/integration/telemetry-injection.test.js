// Integration tests for the analytics injection middleware and the
// /__telemetry endpoint.
//
// What gets injected per surface:
//   - marketing (apex):  Plausible (only when env opts in) + first-party
//                        beacon + support widget
//   - tenant   (org):    first-party beacon + support widget
//   - admin    (/admin): first-party beacon + support widget
//
// We don't assert the exact <script> body — that's covered by the unit
// tests on the helpers. We do assert the markers are spliced into the
// right surfaces and not the wrong ones.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import supertest from "supertest";
import { app } from "../../server/index.js";
import { prisma } from "../../lib/db.js";
import { _resetForTests } from "../../lib/analyticsTag.js";
import { resetDb, TEST_ORG_SLUG } from "./_setup.js";

const request = supertest(app);

beforeAll(() => {
  delete process.env.ORIGIN_AUTH_SECRET;
});

afterAll(() => {
  delete process.env.ANALYTICS_PROVIDER;
  delete process.env.PLAUSIBLE_DOMAIN;
  _resetForTests();
});

describe("HTML injection — apex marketing", () => {
  beforeEach(() => {
    delete process.env.ANALYTICS_PROVIDER;
    delete process.env.PLAUSIBLE_DOMAIN;
    _resetForTests();
  });

  it("injects the first-party beacon + support widget into the marketing index", async () => {
    const r = await request.get("/").set("Host", "compass.app");
    expect(r.status).toBe(200);
    expect(r.text).toContain("/__telemetry");
    expect(r.text).toContain('id="cmp-support-root"');
    expect(r.text).toContain('"marketing"'); // surface
  });

  it("does NOT inject Plausible by default (opt-in only)", async () => {
    const r = await request.get("/").set("Host", "compass.app");
    expect(r.text).not.toContain("plausible.io/js/script.js");
  });

  it("DOES inject Plausible when ANALYTICS_PROVIDER=plausible + domain are set", async () => {
    process.env.ANALYTICS_PROVIDER = "plausible";
    process.env.PLAUSIBLE_DOMAIN = "compass.app";
    _resetForTests();
    const r = await request.get("/").set("Host", "compass.app");
    expect(r.text).toMatch(/<script[^>]+plausible\.io\/js\/script\.js/);
    // Plausible goes in <head>, beacon goes before </body>.
    const headIdx = r.text.indexOf("</head>");
    const plausibleIdx = r.text.indexOf("plausible.io");
    const beaconIdx = r.text.indexOf("/__telemetry");
    expect(plausibleIdx).toBeGreaterThan(0);
    expect(plausibleIdx).toBeLessThan(headIdx);
    expect(beaconIdx).toBeGreaterThan(headIdx);
  });
});

describe("HTML injection — tenant subdomain", () => {
  beforeEach(async () => {
    delete process.env.ANALYTICS_PROVIDER;
    delete process.env.PLAUSIBLE_DOMAIN;
    _resetForTests();
    await resetDb();
  });

  it("injects the beacon + widget into a tenant page (and never Plausible)", async () => {
    process.env.ANALYTICS_PROVIDER = "plausible";
    process.env.PLAUSIBLE_DOMAIN = "compass.app";
    _resetForTests();

    const r = await request.get("/").set("Host", `${TEST_ORG_SLUG}.localhost`);
    expect(r.status).toBe(200);
    expect(r.text).toContain("/__telemetry");
    expect(r.text).toContain('id="cmp-support-root"');
    expect(r.text).toContain('"tenant"');
    // Plausible is configured but tenant pages must NOT load a third-
    // party script — that's an architectural rule.
    expect(r.text).not.toContain("plausible.io/js/script.js");
  });
});

describe("POST /__telemetry — page-view recording", () => {
  beforeEach(resetDb);

  it("accepts a page-view from anonymous marketing visitors and records an AuditLog row", async () => {
    const before = await prisma.auditLog.count({
      where: { action: "analytics:page-view" },
    });
    const r = await request
      .post("/__telemetry")
      .set("Host", "compass.app")
      .set("Content-Type", "application/json")
      .send({ event: "page-view", surface: "marketing", path: "/plans.html" });
    expect(r.status).toBe(204);
    // Best-effort write — tiny delay so the async track() lands.
    await new Promise((r) => setTimeout(r, 50));
    const after = await prisma.auditLog.count({
      where: { action: "analytics:page-view" },
    });
    expect(after).toBe(before + 1);
    const row = await prisma.auditLog.findFirst({
      where: { action: "analytics:page-view" },
      orderBy: { createdAt: "desc" },
    });
    expect(row.summary).toContain("marketing");
    expect(row.summary).toContain("/plans.html");
  });

  it("attributes a tenant-surface event to the org when called from a tenant subdomain", async () => {
    const r = await request
      .post("/__telemetry")
      .set("Host", `${TEST_ORG_SLUG}.localhost`)
      .set("Content-Type", "application/json")
      .send({ event: "page-view", surface: "tenant", path: "/" });
    expect(r.status).toBe(204);
    await new Promise((r) => setTimeout(r, 50));
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const row = await prisma.auditLog.findFirst({
      where: { orgId: org.id, action: "analytics:page-view" },
      orderBy: { createdAt: "desc" },
    });
    expect(row).toBeTruthy();
    expect(row.summary).toContain("tenant");
  });

  it("ignores unknown event names (no AuditLog row created)", async () => {
    const before = await prisma.auditLog.count();
    const r = await request
      .post("/__telemetry")
      .set("Host", "compass.app")
      .set("Content-Type", "application/json")
      .send({ event: "made-up-event", surface: "marketing" });
    expect(r.status).toBe(204);
    await new Promise((r) => setTimeout(r, 50));
    const after = await prisma.auditLog.count();
    expect(after).toBe(before);
  });
});

describe("POST /__telemetry — element-clicked", () => {
  beforeEach(resetDb);

  it("records the data-track label on element-clicked", async () => {
    await request
      .post("/__telemetry")
      .set("Host", "compass.app")
      .set("Content-Type", "application/json")
      .send({
        event: "element-clicked",
        surface: "marketing",
        path: "/",
        label: "hero-cta-start-trial",
      });
    await new Promise((r) => setTimeout(r, 50));
    const row = await prisma.auditLog.findFirst({
      where: { action: "analytics:element-clicked" },
      orderBy: { createdAt: "desc" },
    });
    expect(row.summary).toContain("hero-cta-start-trial");
  });
});

describe("POST /__telemetry — client-error capture", () => {
  beforeEach(resetDb);

  it("records the message + stack truncated to safe lengths", async () => {
    const longStack = "stack line\n".repeat(200); // ~2200 chars, must be clipped
    const r = await request
      .post("/__telemetry")
      .set("Host", "compass.app")
      .set("Content-Type", "application/json")
      .send({
        event: "client-error",
        surface: "admin",
        path: "/admin/calendar.html",
        kind: "error",
        message: "Cannot read properties of undefined (reading 'rsvps')",
        source: "https://compass.app/admin/scripts/calendar.js",
        line: 142,
        col: 18,
        stack: longStack,
        ua: "Mozilla/5.0 (X11; Linux x86_64) Chrome/130",
      });
    expect(r.status).toBe(204);
    await new Promise((r) => setTimeout(r, 50));
    const row = await prisma.auditLog.findFirst({
      where: { action: "analytics:client-error" },
      orderBy: { createdAt: "desc" },
    });
    expect(row).toBeTruthy();
    // The summary column is itself capped at 500 chars (lib/analytics.js)
    // — so even an oversized stack lands cleanly.
    expect(row.summary.length).toBeLessThanOrEqual(500);
    expect(row.summary).toContain("Cannot read properties");
  });
});

describe("POST /__telemetry — fetch-failed capture", () => {
  beforeEach(resetDb);

  it("records non-2xx fetches with status + url", async () => {
    await request
      .post("/__telemetry")
      .set("Host", "compass.app")
      .set("Content-Type", "application/json")
      .send({
        event: "fetch-failed",
        surface: "admin",
        path: "/admin/index.html",
        status: 500,
        url: "/api/v1/orgs/abc123/dashboard",
      });
    await new Promise((r) => setTimeout(r, 50));
    const row = await prisma.auditLog.findFirst({
      where: { action: "analytics:fetch-failed" },
      orderBy: { createdAt: "desc" },
    });
    expect(row.summary).toContain("500");
    expect(row.summary).toContain("/api/v1/orgs/abc123/dashboard");
  });
});
