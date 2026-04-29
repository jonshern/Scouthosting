import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import { app } from "../../server/index.js";
import { prisma } from "../../lib/db.js";
import { resetDb, getCsrf, TEST_ORG_SLUG, mergeCookies } from "./_setup.js";

const request = supertest(app);
const HOST = `${TEST_ORG_SLUG}.localhost`;

beforeAll(() => {
  delete process.env.ORIGIN_AUTH_SECRET;
});

describe("auth flows", () => {
  beforeEach(resetDb);

  // The honeypot's minimum render-to-submit time would otherwise reject
  // a same-tick POST; back-date the timestamp so each test passes the
  // gate without an artificial delay.
  async function backdatedHoneypot() {
    const { _internal } = await import("../../lib/honeypot.js");
    return _internal.sign(Date.now() - 5000);
  }

  it("/signup creates a user, sets a session cookie, and the user is returned by /api/auth/me", async () => {
    const { cookie, csrf } = await getCsrf(request, "/signup");
    const signup = await request
      .post("/signup")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .type("form")
      .send({
        displayName: "Test Person",
        email: "alice@test.invalid",
        password: "this-is-a-strong-pw",
        csrf,
        form_started_at: await backdatedHoneypot(),
      });
    expect(signup.status).toBe(302);

    const sessionCookies = mergeCookies([cookie, signup.headers["set-cookie"]]);
    const me = await request
      .get("/api/auth/me")
      .set("Host", HOST)
      .set("Cookie", sessionCookies);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("alice@test.invalid");
  });

  it("/signup auto-grants admin to the founding scoutmaster (email matches Org.scoutmasterEmail)", async () => {
    const { cookie, csrf } = await getCsrf(request, "/signup");
    await request
      .post("/signup")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .type("form")
      .send({
        displayName: "Test SM",
        email: "sm@test.invalid", // matches the seeded org's scoutmasterEmail
        password: "this-is-a-strong-pw",
        csrf,
        form_started_at: await backdatedHoneypot(),
      });

    const u = await prisma.user.findUnique({ where: { email: "sm@test.invalid" } });
    const m = await prisma.orgMembership.findFirst({ where: { userId: u.id } });
    expect(m.role).toBe("admin");
  });

  it("/login rejects bad credentials with the same form re-rendered", async () => {
    // Create a user via signup
    const { cookie: c1, csrf: csrf1 } = await getCsrf(request, "/signup");
    await request
      .post("/signup")
      .set("Host", HOST)
      .set("Cookie", c1)
      .type("form")
      .send({
        displayName: "Test",
        email: "u@test.invalid",
        password: "this-is-a-strong-pw",
        csrf: csrf1,
        form_started_at: await backdatedHoneypot(),
      });

    // Try to log in with the wrong password
    const { cookie: c2, csrf: csrf2 } = await getCsrf(request, "/login");
    const r = await request
      .post("/login")
      .set("Host", HOST)
      .set("Cookie", c2)
      .type("form")
      .send({ email: "u@test.invalid", password: "wrong-pw", csrf: csrf2 });
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/Invalid credentials/);
  });

  it("/forgot always returns success regardless of whether the email exists", async () => {
    // Unknown email
    const { cookie, csrf } = await getCsrf(request, "/forgot");
    const r = await request
      .post("/forgot")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .type("form")
      .send({ email: "doesnotexist@test.invalid", csrf });
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/Check your email/);
  });
});
