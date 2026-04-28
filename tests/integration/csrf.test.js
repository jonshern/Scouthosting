import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import { app } from "../../server/index.js";
import { resetDb, getCsrf, TEST_ORG_SLUG } from "./_setup.js";

const request = supertest(app);
const HOST = `${TEST_ORG_SLUG}.localhost`;

beforeAll(() => {
  delete process.env.ORIGIN_AUTH_SECRET;
});

describe("CSRF route-level enforcement", () => {
  beforeEach(resetDb);

  it("POST /login with no token → 403", async () => {
    const r = await request
      .post("/login")
      .set("Host", HOST)
      .type("form")
      .send({ email: "x@y.test", password: "doesntmatter" });
    expect(r.status).toBe(403);
    expect(r.text).toMatch(/CSRF/i);
  });

  it("POST /login with mismatched token → 403", async () => {
    const { cookie } = await getCsrf(request, "/login");
    const r = await request
      .post("/login")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .type("form")
      .send({ email: "x@y.test", password: "doesntmatter", csrf: "wrongvalue" });
    expect(r.status).toBe(403);
  });

  it("POST /login with correct token passes CSRF (and lands on the auth check)", async () => {
    const { cookie, csrf } = await getCsrf(request, "/login");
    const r = await request
      .post("/login")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .type("form")
      .send({ email: "noexist@y.test", password: "irrelevant", csrf });
    // Past CSRF means the response is the rendered login page (200) with
    // the "Invalid credentials" flash, not 403.
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/Invalid credentials/i);
  });

  it("POST /api/provision is anonymous-friendly (CSRF skipped)", async () => {
    // No cookie, no token — should still process the body. The fixture
    // doesn't supply scoutmasterEmail, so we expect the validation to
    // reject (400) rather than CSRF (403).
    const r = await request
      .post("/api/provision")
      .set("Content-Type", "application/json")
      .send({});
    expect(r.status).toBe(400);
    expect(r.text).toMatch(/Missing required field/);
  });

  it("anonymous /events/:id/rsvp doesn't require CSRF (anonymous-friendly)", async () => {
    // We need an event to target. Create one via Prisma directly
    // (bypassing admin) so we don't have to log in.
    const { prisma } = await import("../../lib/db.js");
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const ev = await prisma.event.create({
      data: {
        orgId: org.id,
        title: "Test Event",
        startsAt: new Date(Date.now() + 7 * 86400_000),
      },
    });
    const r = await request
      .post(`/events/${ev.id}/rsvp`)
      .set("Host", HOST)
      .type("form")
      .send({ name: "Anon", email: "anon@y.test", response: "yes" });
    // Either 302 (saved) or 302 to ?rsvp=missing — but NOT 403.
    expect(r.status).toBe(302);
    expect(r.headers.location).toContain(`/events/${ev.id}`);
  });
});
