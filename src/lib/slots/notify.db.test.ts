// Waitlist promotion mail against a real Postgres. Skipped unless
// TEST_DATABASE_URL points at a migrated test database.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { releaseSlot } from "./index";
import { notifyPromoted, promotionMessage } from "./notify";

const url = process.env.TEST_DATABASE_URL;

describe("promotionMessage", () => {
  it("escapes names and titles", () => {
    const m = promotionMessage({
      name: "<b>Pat</b>",
      scoutName: "Alex R.",
      slotTitle: "Drive & carpool",
      eventTitle: "Campout",
      startsAt: new Date("2026-11-01T15:00:00Z"),
      orgName: "Troop 1",
    });
    expect(m.html).not.toContain("<b>Pat</b>");
    expect(m.html).toContain("Drive &#38; carpool");
    expect(m.html).toContain("for Alex R.");
  });
});

describe.skipIf(!url)("notifyPromoted against Postgres", () => {
  let prisma: PrismaClient;
  const tag = `slot-notify-db-${Date.now()}`;
  let orgId = "";
  let eventId = "";

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    orgId = (
      await prisma.org.create({
        data: {
          slug: tag,
          unitType: "Troop" as const,
          unitNumber: "996",
          displayName: "Notify test",
          charterOrg: "Test",
          city: "Test",
          state: "TS",
          scoutmasterName: "Test",
          scoutmasterEmail: `${tag}@example.invalid`,
        },
      })
    ).id;
    eventId = (await prisma.event.create({ data: { orgId, title: "Campout", startsAt: new Date() } })).id;
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { endsWith: `-${tag}@example.invalid` } } });
    await prisma?.org.delete({ where: { id: orgId } }).catch(() => {});
    await prisma?.$disconnect();
  });

  it("mails the promoted adult and skips a scout login", async () => {
    const slot = await prisma.signupSlot.create({ data: { orgId, eventId, title: "Driver", capacity: 1 } });
    const holder = await prisma.user.create({ data: { email: `holder-${tag}@example.invalid`, displayName: "Holder" } });
    await prisma.slotAssignment.create({ data: { orgId, slotId: slot.id, userId: holder.id, name: "Holder" } });
    const waiting = await prisma.slotAssignment.create({
      data: { orgId, slotId: slot.id, name: "Pat", email: `pat-${tag}@example.invalid`, waitlisted: true },
    });

    const r = await prisma.$transaction((tx) => releaseSlot(tx, { slotId: slot.id, who: { userId: holder.id } }));
    expect(r.promotedIds).toEqual([waiting.id]);

    const send = vi.fn().mockResolvedValue({ ok: true });
    expect(await notifyPromoted(r.promotedIds, { prismaClient: prisma, send })).toBe(1);
    expect(send.mock.calls[0][0].to).toBe(`pat-${tag}@example.invalid`);

    const scout = await prisma.user.create({ data: { email: `scout-${tag}@example.invalid`, displayName: "Scout" } });
    await prisma.orgMembership.create({ data: { userId: scout.id, orgId, role: "scout" } });
    const scoutSeat = await prisma.slotAssignment.create({
      data: { orgId, slotId: slot.id, userId: scout.id, name: "Scout" },
    });
    send.mockClear();
    expect(await notifyPromoted([scoutSeat.id], { prismaClient: prisma, send })).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});
