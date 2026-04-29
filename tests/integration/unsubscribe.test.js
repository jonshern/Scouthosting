import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import { app } from "../../server/index.js";
import { prisma } from "../../lib/db.js";
import { makeUnsubToken } from "../../lib/unsubToken.js";
import { resetDb, TEST_ORG_SLUG } from "./_setup.js";

const request = supertest(app);
const HOST = `${TEST_ORG_SLUG}.localhost`;

beforeAll(() => {
  process.env.UNSUB_SECRET = "test-unsub-secret";
  delete process.env.ORIGIN_AUTH_SECRET;
});

describe("unsubscribe link", () => {
  let org;
  let member;

  beforeEach(async () => {
    org = await resetDb();
    member = await prisma.member.create({
      data: {
        orgId: org.id,
        firstName: "Pat",
        lastName: "X",
        email: "pat@x.test",
        commPreference: "email",
      },
    });
  });

  it("POST /unsubscribe/:token sets emailUnsubscribed", async () => {
    const token = makeUnsubToken({ memberId: member.id, orgId: org.id });
    const r = await request.post(`/unsubscribe/${token}`).set("Host", HOST);
    expect(r.status).toBe(200);
    const m = await prisma.member.findUnique({ where: { id: member.id } });
    expect(m.emailUnsubscribed).toBe(true);
    expect(m.unsubscribedAt).toBeTruthy();
  });

  it("GET /unsubscribe/:token?one_click=1 unsubscribes immediately (RFC 8058 path)", async () => {
    const token = makeUnsubToken({ memberId: member.id, orgId: org.id });
    const r = await request
      .get(`/unsubscribe/${token}?one_click=1`)
      .set("Host", HOST);
    expect(r.status).toBe(200);
    const m = await prisma.member.findUnique({ where: { id: member.id } });
    expect(m.emailUnsubscribed).toBe(true);
  });

  it("GET /unsubscribe/:token without one_click shows confirmation, does not flip", async () => {
    const token = makeUnsubToken({ memberId: member.id, orgId: org.id });
    const r = await request.get(`/unsubscribe/${token}`).set("Host", HOST);
    expect(r.status).toBe(200);
    const m = await prisma.member.findUnique({ where: { id: member.id } });
    expect(m.emailUnsubscribed).toBe(false);
  });

  it("rejects a token bound to a different org", async () => {
    const otherOrg = await prisma.org.create({
      data: {
        slug: "other",
        unitType: "Troop",
        unitNumber: "1",
        displayName: "Other",
        charterOrg: "x",
        city: "x",
        state: "TS",
        scoutmasterName: "x",
        scoutmasterEmail: "x@x.test",
      },
    });
    const token = makeUnsubToken({ memberId: member.id, orgId: otherOrg.id });
    const r = await request.post(`/unsubscribe/${token}`).set("Host", HOST);
    expect(r.status).toBe(400);
    const m = await prisma.member.findUnique({ where: { id: member.id } });
    expect(m.emailUnsubscribed).toBe(false);
  });

  it("POST /resubscribe/:token reverses the flag", async () => {
    await prisma.member.update({
      where: { id: member.id },
      data: { emailUnsubscribed: true, unsubscribedAt: new Date() },
    });
    const token = makeUnsubToken({ memberId: member.id, orgId: org.id });
    const r = await request.post(`/resubscribe/${token}`).set("Host", HOST);
    expect(r.status).toBe(200);
    const m = await prisma.member.findUnique({ where: { id: member.id } });
    expect(m.emailUnsubscribed).toBe(false);
    expect(m.unsubscribedAt).toBeNull();
  });
});
