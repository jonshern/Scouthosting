// Integration tests for lib/newsletterCron.js — the tick that drafts
// newsletters from NewsletterSchedule rows and fires NewsletterRules.
//
// We exercise the pure runCronTick({ now, prismaClient }) entry point
// (no setInterval, no env reads — caller drives the clock) so the tests
// stay deterministic.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { app } from "../../server/index.js"; // ensure prisma client is initialized
import { prisma } from "../../lib/db.js";
import {
  runCronTick,
  runRsvpNudgeHandler,
  lastFireTime,
  startCronLoop,
} from "../../lib/newsletterCron.js";
import { resetDb, TEST_ORG_SLUG } from "./_setup.js";

beforeAll(() => {
  delete process.env.ORIGIN_AUTH_SECRET;
});

const SILENT_LOGGER = {
  info() {},
  warn() {},
  error() {},
  child() { return SILENT_LOGGER; },
};

async function getTestOrg() {
  return prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
}

describe("lastFireTime()", () => {
  it("returns today's fire time when 'now' is past the configured weekday + time", () => {
    // Sunday Mar 15 2026 at 09:00 UTC; schedule fires Sundays at 07:00.
    const now = new Date("2026-03-15T09:00:00Z");
    const ref = lastFireTime({ weekday: 7, localTime: "07:00", timezone: "UTC" }, now);
    expect(ref.getDay()).toBe(0); // Sunday in JS = 0
    expect(ref < now).toBe(true);
    // Within the same calendar day.
    expect(ref.toDateString()).toBe(now.toDateString());
  });

  it("looks back a full week when 'now' is before today's configured fire time", () => {
    // Sunday Mar 15 2026 at 06:00 UTC; schedule fires Sundays at 07:00.
    const now = new Date("2026-03-15T06:00:00Z");
    const ref = lastFireTime({ weekday: 7, localTime: "07:00", timezone: "UTC" }, now);
    expect((now.getTime() - ref.getTime()) >= 6 * 24 * 60 * 60 * 1000).toBe(true);
  });

  it("reaches back N days when today is not the configured weekday", () => {
    // Friday Mar 13 2026; schedule fires Sundays at 07:00.
    const now = new Date("2026-03-13T12:00:00Z");
    const ref = lastFireTime({ weekday: 7, localTime: "07:00", timezone: "UTC" }, now);
    expect(ref.getDay()).toBe(0);
    expect(ref < now).toBe(true);
  });
});

describe("runCronTick — newsletter scheduling", () => {
  beforeEach(resetDb);

  it("drafts a newsletter when schedule has fired and there's enough material", async () => {
    const org = await getTestOrg();
    // Schedule: Sundays 07:00, min 1 story.
    await prisma.newsletterSchedule.create({
      data: { orgId: org.id, weekday: 7, localTime: "07:00", timezone: "UTC", minStories: 1 },
    });
    // Pin "now" to a Sunday at 09:00 UTC so the schedule has fired.
    // composeNewsletter's lookahead window is keyed off `now`, so
    // the seeded event has to start AFTER pinned-now to be picked up.
    const now = new Date("2026-03-15T09:00:00Z");
    await prisma.event.create({
      data: {
        orgId: org.id,
        title: "Spring Camporee",
        startsAt: new Date("2026-03-22T15:00:00Z"),
        endsAt: new Date("2026-03-22T18:00:00Z"),
      },
    });
    const result = await runCronTick({ now, prismaClient: prisma, logger: SILENT_LOGGER });
    expect(result.schedulesDrafted).toBe(1);
    expect(result.schedulesSkipped).toBe(0);

    const drafts = await prisma.newsletter.findMany({ where: { orgId: org.id } });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].status).toBe("draft");
    expect(drafts[0].includedEventIds.length).toBeGreaterThanOrEqual(1);

    // lastDraftedAt was advanced.
    const sched = await prisma.newsletterSchedule.findUnique({ where: { orgId: org.id } });
    expect(sched.lastDraftedAt).not.toBeNull();
  });

  it("skips drafting when material is below minStories", async () => {
    const org = await getTestOrg();
    await prisma.newsletterSchedule.create({
      data: { orgId: org.id, weekday: 7, localTime: "07:00", timezone: "UTC", minStories: 5 },
    });
    // No events, no posts → composeNewsletter returns 0 stories.
    const now = new Date("2026-03-15T09:00:00Z");
    const result = await runCronTick({ now, prismaClient: prisma, logger: SILENT_LOGGER });
    expect(result.schedulesDrafted).toBe(0);
    expect(result.schedulesSkipped).toBe(1);

    const drafts = await prisma.newsletter.findMany({ where: { orgId: org.id } });
    expect(drafts).toHaveLength(0);
    // lastDraftedAt still advanced so we don't keep re-trying every tick.
    const sched = await prisma.newsletterSchedule.findUnique({ where: { orgId: org.id } });
    expect(sched.lastDraftedAt).not.toBeNull();
  });

  it("does NOT re-draft within the same fire window (idempotent across ticks)", async () => {
    const org = await getTestOrg();
    await prisma.newsletterSchedule.create({
      data: { orgId: org.id, weekday: 7, localTime: "07:00", timezone: "UTC", minStories: 1 },
    });
    const now = new Date("2026-03-15T09:00:00Z");
    await prisma.event.create({
      data: {
        orgId: org.id,
        title: "x",
        startsAt: new Date("2026-03-16T18:00:00Z"),
        endsAt: new Date("2026-03-16T20:00:00Z"),
      },
    });
    const r1 = await runCronTick({ now, prismaClient: prisma, logger: SILENT_LOGGER });
    expect(r1.schedulesDrafted).toBe(1);
    const r2 = await runCronTick({ now, prismaClient: prisma, logger: SILENT_LOGGER });
    expect(r2.schedulesDrafted).toBe(0);
    const drafts = await prisma.newsletter.count({ where: { orgId: org.id } });
    expect(drafts).toBe(1);
  });

  it("never drafts for paused schedules", async () => {
    const org = await getTestOrg();
    await prisma.newsletterSchedule.create({
      data: { orgId: org.id, weekday: 7, localTime: "07:00", timezone: "UTC", minStories: 1, paused: true },
    });
    const now = new Date("2026-03-15T09:00:00Z");
    await prisma.event.create({
      data: {
        orgId: org.id,
        title: "x",
        startsAt: new Date("2026-03-16T18:00:00Z"),
        endsAt: new Date("2026-03-16T20:00:00Z"),
      },
    });
    const result = await runCronTick({ now, prismaClient: prisma, logger: SILENT_LOGGER });
    expect(result.schedulesDrafted).toBe(0);
    expect(result.schedulesSkipped).toBe(0);
  });

  it("does not clobber an existing draft inside the fire window", async () => {
    const org = await getTestOrg();
    await prisma.newsletterSchedule.create({
      data: { orgId: org.id, weekday: 7, localTime: "07:00", timezone: "UTC", minStories: 1 },
    });
    // Pre-existing draft created by the leader earlier.
    await prisma.newsletter.create({
      data: { orgId: org.id, title: "leader-touched", intro: "Hi.", status: "draft" },
    });
    const now = new Date("2026-03-15T09:00:00Z");
    await prisma.event.create({
      data: {
        orgId: org.id,
        title: "x",
        startsAt: new Date("2026-03-16T18:00:00Z"),
        endsAt: new Date("2026-03-16T20:00:00Z"),
      },
    });
    const result = await runCronTick({ now, prismaClient: prisma, logger: SILENT_LOGGER });
    expect(result.schedulesDrafted).toBe(0);
    const drafts = await prisma.newsletter.findMany({ where: { orgId: org.id } });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toBe("leader-touched");
  });
});

describe("runCronTick — rule firing", () => {
  beforeEach(resetDb);

  it("fires an enabled rule and updates lastFiredAt + lastResult", async () => {
    const org = await getTestOrg();
    // Use a rule kind that's still on the v1 scaffold path so the
    // contract under test is "the tick fires + records something",
    // not the rsvp_nudge handler's specific behaviour (which is
    // covered separately below).
    const rule = await prisma.newsletterRule.create({
      data: { orgId: org.id, kind: "dues_reminder", title: "Q1 dues", enabled: true },
    });
    const result = await runCronTick({ prismaClient: prisma, logger: SILENT_LOGGER });
    expect(result.rulesFired).toBe(1);

    const fresh = await prisma.newsletterRule.findUnique({ where: { id: rule.id } });
    expect(fresh.lastFiredAt).not.toBeNull();
    expect(fresh.lastResult).toContain("dues_reminder");
  });

  it("does NOT fire a disabled rule", async () => {
    const org = await getTestOrg();
    await prisma.newsletterRule.create({
      data: { orgId: org.id, kind: "dues_reminder", title: "Q1 dues", enabled: false },
    });
    const result = await runCronTick({ prismaClient: prisma, logger: SILENT_LOGGER });
    expect(result.rulesFired).toBe(0);
  });

  it("respects the per-kind cadence floor (won't refire within the floor window)", async () => {
    const org = await getTestOrg();
    const rule = await prisma.newsletterRule.create({
      data: {
        orgId: org.id,
        kind: "dues_reminder",                                 // 24h floor
        title: "Q1 dues",
        enabled: true,
        lastFiredAt: new Date(Date.now() - 60 * 60 * 1000),    // 1h ago
      },
    });
    const result = await runCronTick({ prismaClient: prisma, logger: SILENT_LOGGER });
    expect(result.rulesFired).toBe(0);

    // Pretend a day passed.
    const future = new Date(Date.now() + 25 * 60 * 60 * 1000);
    const result2 = await runCronTick({ now: future, prismaClient: prisma, logger: SILENT_LOGGER });
    expect(result2.rulesFired).toBe(1);

    const fresh = await prisma.newsletterRule.findUnique({ where: { id: rule.id } });
    expect(fresh.lastFiredAt.getTime()).toBeGreaterThan(rule.lastFiredAt.getTime());
  });
});

describe("startCronLoop()", () => {
  it("returns a no-op stop function when CRON_DISABLED=1", () => {
    const saved = process.env.CRON_DISABLED;
    process.env.CRON_DISABLED = "1";
    try {
      const stop = startCronLoop({ prismaClient: prisma, logger: SILENT_LOGGER });
      expect(typeof stop).toBe("function");
      stop(); // calling it must not throw
    } finally {
      if (saved == null) delete process.env.CRON_DISABLED;
      else process.env.CRON_DISABLED = saved;
    }
  });
});

describe("runRsvpNudgeHandler", () => {
  beforeEach(resetDb);

  it("sends a nudge to every member who hasn't RSVP'd to a signup-required event in the next 7 days", async () => {
    const org = await getTestOrg();
    const now = new Date();
    const ev = await prisma.event.create({
      data: {
        orgId: org.id,
        title: "Spring Camporee",
        startsAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        signupRequired: true,
        location: "Tomahawk SR",
      },
    });
    // Three members; two unresponded, one already said yes.
    await prisma.member.createMany({
      data: [
        { orgId: org.id, firstName: "Alice", lastName: "A.", email: "alice@test.invalid" },
        { orgId: org.id, firstName: "Bob",   lastName: "B.", email: "bob@test.invalid" },
        { orgId: org.id, firstName: "Carol", lastName: "C.", email: "carol@test.invalid" },
      ],
    });
    await prisma.rsvp.create({
      data: { orgId: org.id, eventId: ev.id, name: "Carol C.", email: "carol@test.invalid", response: "yes" },
    });
    const rule = await prisma.newsletterRule.create({
      data: { orgId: org.id, kind: "rsvp_nudge", title: "RSVP nudge", enabled: true },
    });

    const result = await runRsvpNudgeHandler({ now, rule, prismaClient: prisma, logger: SILENT_LOGGER });
    expect(result).toContain("1 event");
    expect(result).toContain("2 nudges sent");
  });

  it("counts zero events when no signup-required event is in the next 7 days", async () => {
    const org = await getTestOrg();
    const now = new Date();
    // Event is 30 days out — outside the horizon.
    await prisma.event.create({
      data: {
        orgId: org.id,
        title: "Future Trek",
        startsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 32 * 24 * 60 * 60 * 1000),
        signupRequired: true,
      },
    });
    await prisma.member.create({
      data: { orgId: org.id, firstName: "A", lastName: "A", email: "a@x.invalid" },
    });
    const rule = await prisma.newsletterRule.create({
      data: { orgId: org.id, kind: "rsvp_nudge", title: "Nudge", enabled: true },
    });
    const result = await runRsvpNudgeHandler({ now, rule, prismaClient: prisma, logger: SILENT_LOGGER });
    expect(result).toContain("0 events");
  });

  it("skips members who unsubscribed, bounced, or set commPreference=none", async () => {
    const org = await getTestOrg();
    const now = new Date();
    await prisma.event.create({
      data: {
        orgId: org.id,
        title: "Camporee",
        startsAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
        signupRequired: true,
      },
    });
    await prisma.member.createMany({
      data: [
        { orgId: org.id, firstName: "A", lastName: "A", email: "a@x.invalid", emailUnsubscribed: true },
        { orgId: org.id, firstName: "B", lastName: "B", email: "b@x.invalid", bouncedAt: new Date() },
        { orgId: org.id, firstName: "C", lastName: "C", email: "c@x.invalid", commPreference: "none" },
        { orgId: org.id, firstName: "D", lastName: "D", email: "d@x.invalid" }, // only this one gets the nudge
      ],
    });
    const rule = await prisma.newsletterRule.create({
      data: { orgId: org.id, kind: "rsvp_nudge", title: "Nudge", enabled: true },
    });
    const result = await runRsvpNudgeHandler({ now, rule, prismaClient: prisma, logger: SILENT_LOGGER });
    expect(result).toContain("1 nudge");
  });

  it("integrates through runCronTick — a real rule fires and updates lastFiredAt + lastResult", async () => {
    const org = await getTestOrg();
    const now = new Date();
    await prisma.event.create({
      data: {
        orgId: org.id,
        title: "Camporee",
        startsAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        signupRequired: true,
      },
    });
    await prisma.member.create({
      data: { orgId: org.id, firstName: "A", lastName: "A", email: "a@x.invalid" },
    });
    const rule = await prisma.newsletterRule.create({
      data: { orgId: org.id, kind: "rsvp_nudge", title: "Nudge", enabled: true },
    });

    const out = await runCronTick({ now, prismaClient: prisma, logger: SILENT_LOGGER });
    expect(out.rulesFired).toBe(1);

    const fresh = await prisma.newsletterRule.findUnique({ where: { id: rule.id } });
    expect(fresh.lastFiredAt).not.toBeNull();
    // Real handler result, not the scaffold message.
    expect(fresh.lastResult).not.toContain("scaffold");
    expect(fresh.lastResult).toContain("nudge");
  });
});
