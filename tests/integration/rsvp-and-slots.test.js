import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import { app } from "../../server/index.js";
import { prisma } from "../../lib/db.js";
import { makeRsvpToken } from "../../lib/rsvpToken.js";
import { resetDb, TEST_ORG_SLUG } from "./_setup.js";

const request = supertest(app);
const HOST = `${TEST_ORG_SLUG}.localhost`;

beforeAll(() => {
  delete process.env.ORIGIN_AUTH_SECRET;
});

describe("RSVP + signup-slot flows", () => {
  let event;

  beforeEach(async () => {
    await resetDb();
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    event = await prisma.event.create({
      data: {
        orgId: org.id,
        title: "Test Campout",
        startsAt: new Date(Date.now() + 7 * 86400_000),
      },
    });
  });

  it("anonymous RSVP creates a row keyed by email; resubmit upserts", async () => {
    const r1 = await request
      .post(`/events/${event.id}/rsvp`)
      .set("Host", HOST)
      .type("form")
      .send({ name: "Pat", email: "pat@test.invalid", response: "yes", guests: 1 });
    expect(r1.status).toBe(302);
    expect(r1.headers.location).toMatch(/rsvp=saved/);

    let rsvps = await prisma.rsvp.findMany({ where: { eventId: event.id } });
    expect(rsvps).toHaveLength(1);
    expect(rsvps[0].response).toBe("yes");
    expect(rsvps[0].guests).toBe(1);

    // Same email, change response → upserts.
    const r2 = await request
      .post(`/events/${event.id}/rsvp`)
      .set("Host", HOST)
      .type("form")
      .send({ name: "Pat", email: "pat@test.invalid", response: "maybe", guests: 0 });
    expect(r2.status).toBe(302);

    rsvps = await prisma.rsvp.findMany({ where: { eventId: event.id } });
    expect(rsvps).toHaveLength(1);
    expect(rsvps[0].response).toBe("maybe");
    expect(rsvps[0].guests).toBe(0);
  });

  it("invalid email on anon RSVP → 302 to ?rsvp=missing, no row created", async () => {
    const r = await request
      .post(`/events/${event.id}/rsvp`)
      .set("Host", HOST)
      .type("form")
      .send({ name: "X", email: "not-an-email", response: "yes" });
    expect(r.status).toBe(302);
    expect(r.headers.location).toContain("rsvp=missing");
    const rsvps = await prisma.rsvp.findMany({ where: { eventId: event.id } });
    expect(rsvps).toHaveLength(0);
  });

  it("HMAC-token RSVP from email link records the response", async () => {
    const token = makeRsvpToken({
      eventId: event.id,
      name: "Pat From Inbox",
      email: "inbox@test.invalid",
    });
    const r = await request
      .get(`/rsvp/${token}?response=yes`)
      .set("Host", HOST);
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/Thanks/);

    const rsvps = await prisma.rsvp.findMany({ where: { eventId: event.id } });
    expect(rsvps).toHaveLength(1);
    expect(rsvps[0].name).toBe("Pat From Inbox");
    expect(rsvps[0].email).toBe("inbox@test.invalid");
    expect(rsvps[0].response).toBe("yes");
  });

  it("tampered token returns 400", async () => {
    const r = await request.get("/rsvp/garbage").set("Host", HOST);
    expect(r.status).toBe(400);
  });

  it("slot capacity is enforced for active sign-ups; overflow goes to waitlist", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const slot = await prisma.signupSlot.create({
      data: {
        orgId: org.id,
        eventId: event.id,
        title: "Drive 2 scouts",
        capacity: 2,
      },
    });

    const url = `/events/${event.id}/slots/${slot.id}/take`;
    const take = (i) =>
      request
        .post(url)
        .set("Host", HOST)
        .type("form")
        .send({ name: `Driver ${i}`, email: `driver${i}@test.invalid` });

    const a = await take(1);
    expect(a.headers.location).toContain("slot=taken");

    const b = await take(2);
    expect(b.headers.location).toContain("slot=taken");

    const c = await take(3);
    expect(c.headers.location).toContain("slot=waitlisted");

    const active = await prisma.slotAssignment.findMany({
      where: { slotId: slot.id, waitlisted: false },
    });
    expect(active).toHaveLength(2);

    const waiting = await prisma.slotAssignment.findMany({
      where: { slotId: slot.id, waitlisted: true },
    });
    expect(waiting).toHaveLength(1);
    expect(waiting[0].email).toBe("driver3@test.invalid");
  });

  it("releasing an active slot auto-promotes the oldest waitlister", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const slot = await prisma.signupSlot.create({
      data: { orgId: org.id, eventId: event.id, title: "Drive", capacity: 1 },
    });
    const url = `/events/${event.id}/slots/${slot.id}/take`;
    for (let i = 1; i <= 3; i++) {
      await request
        .post(url)
        .set("Host", HOST)
        .type("form")
        .send({ name: `P${i}`, email: `p${i}@test.invalid` });
    }

    const release = await request
      .post(`/events/${event.id}/slots/${slot.id}/release`)
      .set("Host", HOST)
      .type("form")
      .send({ email: "p1@test.invalid" });
    expect(release.status).toBe(302);

    const rows = await prisma.slotAssignment.findMany({
      where: { slotId: slot.id },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    // p2 promoted to active, p3 still waiting.
    const p2 = rows.find((r) => r.email === "p2@test.invalid");
    const p3 = rows.find((r) => r.email === "p3@test.invalid");
    expect(p2.waitlisted).toBe(false);
    expect(p3.waitlisted).toBe(true);
  });

  it("releasing a waitlist row does not promote anyone", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const slot = await prisma.signupSlot.create({
      data: { orgId: org.id, eventId: event.id, title: "Drive", capacity: 1 },
    });
    const url = `/events/${event.id}/slots/${slot.id}/take`;
    for (let i = 1; i <= 3; i++) {
      await request
        .post(url)
        .set("Host", HOST)
        .type("form")
        .send({ name: `P${i}`, email: `p${i}@test.invalid` });
    }

    // p3 (a waitlister) bails — p2 should stay waitlisted.
    await request
      .post(`/events/${event.id}/slots/${slot.id}/release`)
      .set("Host", HOST)
      .type("form")
      .send({ email: "p3@test.invalid" });

    const rows = await prisma.slotAssignment.findMany({ where: { slotId: slot.id } });
    expect(rows).toHaveLength(2);
    const p1 = rows.find((r) => r.email === "p1@test.invalid");
    const p2 = rows.find((r) => r.email === "p2@test.invalid");
    expect(p1.waitlisted).toBe(false);
    expect(p2.waitlisted).toBe(true);
  });

  it("with allowWaitlist=false, the third take is rejected as full", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const slot = await prisma.signupSlot.create({
      data: {
        orgId: org.id,
        eventId: event.id,
        title: "Drive",
        capacity: 2,
        allowWaitlist: false,
      },
    });
    const url = `/events/${event.id}/slots/${slot.id}/take`;
    for (let i = 1; i <= 2; i++) {
      const r = await request
        .post(url)
        .set("Host", HOST)
        .type("form")
        .send({ name: `P${i}`, email: `p${i}@test.invalid` });
      expect(r.headers.location).toContain("slot=taken");
    }
    const c = await request
      .post(url)
      .set("Host", HOST)
      .type("form")
      .send({ name: "P3", email: "p3@test.invalid" });
    expect(c.headers.location).toContain("slot=full");
    const rows = await prisma.slotAssignment.findMany({ where: { slotId: slot.id } });
    expect(rows).toHaveLength(2);
  });

  it("slot release by anon email removes only that assignment", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const slot = await prisma.signupSlot.create({
      data: { orgId: org.id, eventId: event.id, title: "Bring drinks", capacity: 3 },
    });
    for (let i = 1; i <= 2; i++) {
      await request
        .post(`/events/${event.id}/slots/${slot.id}/take`)
        .set("Host", HOST)
        .type("form")
        .send({ name: `Person ${i}`, email: `p${i}@test.invalid` });
    }

    const release = await request
      .post(`/events/${event.id}/slots/${slot.id}/release`)
      .set("Host", HOST)
      .type("form")
      .send({ email: "p1@test.invalid" });
    expect(release.status).toBe(302);

    const left = await prisma.slotAssignment.findMany({ where: { slotId: slot.id } });
    expect(left).toHaveLength(1);
    expect(left[0].email).toBe("p2@test.invalid");
  });
});
