import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import { app } from "../../server/index.js";
import { prisma } from "../../lib/db.js";
import { resetDb, TEST_ORG_SLUG } from "./_setup.js";

const request = supertest(app);

beforeAll(() => {
  // The test config defaults env so this isn't strictly necessary,
  // but make ORIGIN_AUTH_SECRET unset so the originAuth middleware
  // is a no-op for these tests.
  delete process.env.ORIGIN_AUTH_SECRET;
});

describe("multi-tenant routing", () => {
  beforeEach(resetDb);

  it("apex (no subdomain) serves the marketing index", async () => {
    const r = await request.get("/").set("Host", "compass.app");
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/Compass/i);
  });

  it("known subdomain renders the org template, not the marketing page", async () => {
    const r = await request.get("/").set("Host", `${TEST_ORG_SLUG}.localhost`);
    expect(r.status).toBe(200);
    expect(r.text).toContain("Test Troop 999");
  });

  it("unknown subdomain returns the friendly 404, not the marketing site", async () => {
    const r = await request.get("/").set("Host", "nonexistent.localhost");
    expect(r.status).toBe(404);
    expect(r.text).toMatch(/No Compass site/i);
  });

  it("photo URLs are scoped to the org — cross-org filename returns 404", async () => {
    // Seed two orgs, each with one photo + album; ask org A for org B's
    // file by name. Should be 404 because the Photo lookup includes
    // orgId.
    const orgA = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const orgB = await prisma.org.create({
      data: {
        slug: "otherorg",
        unitType: "Troop",
        unitNumber: "12",
        displayName: "Other Org",
        charterOrg: "x",
        city: "y",
        state: "ZZ",
        scoutmasterName: "x",
        scoutmasterEmail: "x@test.invalid",
      },
    });

    const albumB = await prisma.album.create({
      data: { orgId: orgB.id, slug: "trip", title: "Trip", visibility: "public" },
    });
    const photoB = await prisma.photo.create({
      data: {
        orgId: orgB.id,
        albumId: albumB.id,
        filename: "secret-only-on-b.png",
        mimeType: "image/png",
        sizeBytes: 1,
      },
    });

    // Same filename, but request comes through org A's host. The
    // /uploads route only finds Photos where orgId = A; so this 404s.
    const r = await request
      .get(`/uploads/${photoB.filename}`)
      .set("Host", `${TEST_ORG_SLUG}.localhost`);
    expect(r.status).toBe(404);
  });

  it("custom-page lookup is per-org — a slug seeded on org B is not visible from org A", async () => {
    const orgA = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const orgB = await prisma.org.create({
      data: {
        slug: "anotherorg",
        unitType: "Troop",
        unitNumber: "3",
        displayName: "Another",
        charterOrg: "x",
        city: "y",
        state: "ZZ",
        scoutmasterName: "x",
        scoutmasterEmail: "x@test.invalid",
      },
    });
    await prisma.customPage.create({
      data: { orgId: orgB.id, slug: "history", title: "B History", body: "secret" },
    });

    const r = await request.get("/p/history").set("Host", `${TEST_ORG_SLUG}.localhost`);
    expect(r.status).toBe(404);
  });
});
