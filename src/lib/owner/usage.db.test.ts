// A unit's usage counts what its people made in the window and who
// signed in, and its last activity moves it from not started to active.
// Runs only with TEST_DATABASE_URL set.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { unitUsage } from "./usage";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}`;
const DAY = 86_400_000;

describe.skipIf(!db)("unit usage", () => {
  let orgId = "";
  let userId = "";

  beforeAll(async () => {
    const org = await prisma.org.create({
      data: {
        slug: `usage-${S}`,
        unitType: "Troop",
        unitNumber: "77",
        displayName: `Usage Troop ${S}`,
        charterOrg: "Test",
        city: "Anytown",
        state: "MN",
        scoutmasterName: "Leader",
        scoutmasterEmail: `usage-${S}@example.invalid`,
      },
    });
    orgId = org.id;
    userId = (await prisma.user.create({ data: { email: `usage-${S}@example.invalid`, displayName: "Usage Leader" } })).id;
    await prisma.orgMembership.create({ data: { orgId, userId, role: "leader" } });
  });

  afterAll(async () => {
    await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it("a new unit with nothing yet hasn't started", async () => {
    const [u] = await unitUsage({ orgId });
    expect(u).toMatchObject({ state: "not_started", lastActiveAt: null, upcomingEvents: 0 });
    expect(u.counts.events).toBe(0);
  });

  it("counts events, chat messages and sign-ins in the window", async () => {
    await prisma.event.create({ data: { orgId, title: "Campout", startsAt: new Date(Date.now() + 5 * DAY) } });
    await prisma.event.create({
      data: { orgId, title: "Old meeting", startsAt: new Date(Date.now() - 60 * DAY), createdAt: new Date(Date.now() - 60 * DAY) },
    });
    const channel = await prisma.channel.create({ data: { orgId, kind: "troop", name: "Troop" } });
    await prisma.message.create({ data: { channelId: channel.id, authorId: userId, body: "See you Saturday" } });
    await prisma.message.create({ data: { channelId: channel.id, authorId: userId, body: "gone", deletedAt: new Date() } });
    await prisma.session.create({
      data: { userId, token: `usage-${S}`, expiresAt: new Date(Date.now() + DAY) },
    });

    const [u] = await unitUsage({ orgId });
    expect(u.counts).toMatchObject({ events: 1, messages: 1, peopleSignedIn: 1 });
    expect(u.upcomingEvents).toBe(1);
    expect(u.state).toBe("active");
    expect(u.lastActiveAt).toBeInstanceOf(Date);
  });
});
