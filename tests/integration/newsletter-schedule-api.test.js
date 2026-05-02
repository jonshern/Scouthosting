// Integration tests for /api/v1/orgs/:orgId/newsletter/{schedule,rules}
// and /api/v1/newsletter/rules/:id.
//
// Covers:
//   - schedule upsert (idempotent on the same orgId)
//   - admin / leader gating on writes (parents can read, can't write)
//   - rule CRUD with kind enum validation
//   - cross-org isolation (404 on stranger requests, not 403)

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import { app } from "../../server/index.js";
import { prisma } from "../../lib/db.js";
import { issueToken } from "../../lib/apiToken.js";
import { resetDb, TEST_ORG_SLUG } from "./_setup.js";

const request = supertest(app);

beforeAll(() => {
  delete process.env.ORIGIN_AUTH_SECRET;
});

async function seedUser({ email, displayName, orgId, role = "leader" }) {
  const user = await prisma.user.create({
    data: { email, displayName, emailVerified: true },
  });
  if (orgId) {
    await prisma.orgMembership.create({
      data: { userId: user.id, orgId, role },
    });
  }
  const t = await issueToken(user.id, `${displayName} test token`, prisma);
  return { user, token: t.raw };
}

describe("/api/v1/orgs/:orgId/newsletter/schedule", () => {
  beforeEach(resetDb);

  it("returns null schedule for an org that hasn't configured one yet", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "leader@test.invalid",
      displayName: "L",
      orgId: org.id,
      role: "leader",
    });
    const r = await request
      .get(`/api/v1/orgs/${org.id}/newsletter/schedule`)
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.schedule).toBe(null);
  });

  it("PUT upserts the schedule (creates on first call, updates on second)", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "leader@test.invalid",
      displayName: "L",
      orgId: org.id,
      role: "leader",
    });

    const create = await request
      .put(`/api/v1/orgs/${org.id}/newsletter/schedule`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        weekday: 7, // Sunday
        localTime: "19:00",
        timezone: "America/Chicago",
        senderName: "Eric Schulz · SM",
        replyToEmail: "schulz.eric@gmail.com",
        minStories: 2,
        paused: false,
      });
    expect(create.status).toBe(200);
    expect(create.body.schedule.weekday).toBe(7);
    expect(create.body.schedule.localTime).toBe("19:00");

    const update = await request
      .put(`/api/v1/orgs/${org.id}/newsletter/schedule`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        weekday: 1, // Monday
        localTime: "08:30",
        timezone: "America/New_York",
        paused: true,
      });
    expect(update.status).toBe(200);
    expect(update.body.schedule.weekday).toBe(1);
    expect(update.body.schedule.localTime).toBe("08:30");
    expect(update.body.schedule.paused).toBe(true);

    // Exactly one schedule row per org.
    const count = await prisma.newsletterSchedule.count({ where: { orgId: org.id } });
    expect(count).toBe(1);
  });

  it("rejects an invalid weekday (must be 1..7)", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "leader@test.invalid",
      displayName: "L",
      orgId: org.id,
      role: "leader",
    });
    const r = await request
      .put(`/api/v1/orgs/${org.id}/newsletter/schedule`)
      .set("Authorization", `Bearer ${token}`)
      .send({ weekday: 9, localTime: "19:00", timezone: "America/Chicago" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_weekday");
  });

  it("rejects malformed localTime", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "leader@test.invalid",
      displayName: "L",
      orgId: org.id,
      role: "leader",
    });
    const r = await request
      .put(`/api/v1/orgs/${org.id}/newsletter/schedule`)
      .set("Authorization", `Bearer ${token}`)
      .send({ weekday: 7, localTime: "tea-time", timezone: "America/Chicago" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_localTime");
  });

  it("PUT requires admin or leader role (parent → 403)", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "parent@test.invalid",
      displayName: "Parent",
      orgId: org.id,
      role: "parent",
    });
    const r = await request
      .put(`/api/v1/orgs/${org.id}/newsletter/schedule`)
      .set("Authorization", `Bearer ${token}`)
      .send({ weekday: 7, localTime: "19:00" });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("forbidden");
  });

  it("GET requires the caller be a member (cross-org → 404)", async () => {
    const orgA = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const orgB = await prisma.org.create({
      data: {
        slug: "otherorg",
        unitType: "Troop",
        unitNumber: "12",
        displayName: "Other",
        charterOrg: "x",
        city: "y",
        state: "Z",
        scoutmasterName: "z",
        scoutmasterEmail: "z@x.invalid",
      },
    });
    const { token: bTok } = await seedUser({
      email: "b@test.invalid",
      displayName: "B",
      orgId: orgB.id,
      role: "leader",
    });
    const r = await request
      .get(`/api/v1/orgs/${orgA.id}/newsletter/schedule`)
      .set("Authorization", `Bearer ${bTok}`);
    expect(r.status).toBe(404);
  });

  it("requires an Authorization header", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const r = await request.get(`/api/v1/orgs/${org.id}/newsletter/schedule`);
    expect(r.status).toBe(401);
  });
});

describe("/api/v1/orgs/:orgId/newsletter/rules", () => {
  beforeEach(resetDb);

  it("creates a rule with a valid kind (returns 201 + rule)", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "leader@test.invalid",
      displayName: "L",
      orgId: org.id,
      role: "leader",
    });
    const r = await request
      .post(`/api/v1/orgs/${org.id}/newsletter/rules`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        kind: "rsvp_nudge",
        title: "RSVP nudge · 7 days before",
        description: "Remind families who haven't replied to a campout.",
        config: { daysBefore: 7, fireHour: 15 },
        enabled: true,
      });
    expect(r.status).toBe(201);
    expect(r.body.rule.kind).toBe("rsvp_nudge");
    expect(r.body.rule.title).toContain("RSVP nudge");
    expect(r.body.rule.config.daysBefore).toBe(7);
    expect(r.body.rule.enabled).toBe(true);
  });

  it("rejects an unknown rule kind", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "leader@test.invalid",
      displayName: "L",
      orgId: org.id,
      role: "leader",
    });
    const r = await request
      .post(`/api/v1/orgs/${org.id}/newsletter/rules`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "send_a_text_to_grandma", title: "Made up" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_kind");
  });

  it("requires admin/leader role to create rules", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "p@test.invalid",
      displayName: "P",
      orgId: org.id,
      role: "parent",
    });
    const r = await request
      .post(`/api/v1/orgs/${org.id}/newsletter/rules`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "dues_reminder", title: "Q1 dues" });
    expect(r.status).toBe(403);
  });

  it("GET lists rules for the caller's org in createdAt order", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "leader@test.invalid",
      displayName: "L",
      orgId: org.id,
      role: "leader",
    });

    await prisma.newsletterRule.create({
      data: { orgId: org.id, kind: "rsvp_nudge", title: "first" },
    });
    await new Promise((r) => setTimeout(r, 10));
    await prisma.newsletterRule.create({
      data: { orgId: org.id, kind: "dues_reminder", title: "second" },
    });

    const r = await request
      .get(`/api/v1/orgs/${org.id}/newsletter/rules`)
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.rules).toHaveLength(2);
    expect(r.body.rules[0].title).toBe("first");
    expect(r.body.rules[1].title).toBe("second");
  });

  it("PATCH /newsletter/rules/:id toggles enabled and updates fields", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "leader@test.invalid",
      displayName: "L",
      orgId: org.id,
      role: "leader",
    });
    const rule = await prisma.newsletterRule.create({
      data: { orgId: org.id, kind: "post_event_recap", title: "Recap", enabled: true },
    });

    const r = await request
      .patch(`/api/v1/newsletter/rules/${rule.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: false, title: "Recap (paused)" });
    expect(r.status).toBe(200);
    expect(r.body.rule.enabled).toBe(false);
    expect(r.body.rule.title).toBe("Recap (paused)");
  });

  it("PATCH on a stranger's rule returns 403 (caller is not an admin/leader of that org)", async () => {
    const orgA = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const orgB = await prisma.org.create({
      data: {
        slug: "otherorg",
        unitType: "Troop",
        unitNumber: "12",
        displayName: "Other",
        charterOrg: "x",
        city: "y",
        state: "Z",
        scoutmasterName: "z",
        scoutmasterEmail: "z@x.invalid",
      },
    });
    // Rule belongs to orgA.
    const rule = await prisma.newsletterRule.create({
      data: { orgId: orgA.id, kind: "birthday", title: "Birthdays" },
    });
    // Caller is admin of orgB only.
    const { token: bTok } = await seedUser({
      email: "b@test.invalid",
      displayName: "B",
      orgId: orgB.id,
      role: "admin",
    });

    const r = await request
      .patch(`/api/v1/newsletter/rules/${rule.id}`)
      .set("Authorization", `Bearer ${bTok}`)
      .send({ enabled: false });
    expect(r.status).toBe(403);

    // The rule didn't change.
    const fresh = await prisma.newsletterRule.findUnique({ where: { id: rule.id } });
    expect(fresh.enabled).toBe(true);
  });

  it("DELETE removes the rule (admin/leader only, 204 on success)", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "leader@test.invalid",
      displayName: "L",
      orgId: org.id,
      role: "leader",
    });
    const rule = await prisma.newsletterRule.create({
      data: { orgId: org.id, kind: "medform_expiry", title: "Med form" },
    });

    const r = await request
      .delete(`/api/v1/newsletter/rules/${rule.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(204);

    const after = await prisma.newsletterRule.findUnique({ where: { id: rule.id } });
    expect(after).toBeNull();
  });

  it("DELETE 404s on an unknown rule id", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "leader@test.invalid",
      displayName: "L",
      orgId: org.id,
      role: "leader",
    });
    const r = await request
      .delete(`/api/v1/newsletter/rules/does-not-exist`)
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(404);
  });
});
