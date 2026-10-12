// Capacity limits hold when requests race, against a real Postgres:
// event headcount for RSVPs, equipment units for loans, and waitlists
// moving up when a slot grows. Skipped unless TEST_DATABASE_URL points
// at a migrated test database.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { recordLinkRsvp } from "./link";
import { lendIfAvailable } from "@/lib/equipment/lend";
import { claimSlot, fillFromWaitlist } from "@/lib/slots";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("capacity under concurrency", () => {
  const tag = `capacity-${Date.now()}`;
  let orgId = "";

  beforeAll(async () => {
    const org = await prisma.org.create({
      data: {
        slug: tag,
        unitType: "Troop",
        unitNumber: "995",
        displayName: "Capacity test",
        charterOrg: "Test",
        city: "Test",
        state: "TS",
        scoutmasterName: "Test",
        scoutmasterEmail: `${tag}@example.invalid`,
      },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.org.deleteMany({ where: { id: orgId } });
  });

  const rsvp = (eventId: string, who: string, response: "yes" | "no" | "maybe", guests = 0) =>
    recordLinkRsvp({
      claims: { eventId, name: who, email: `${who}-${tag}@example.invalid`, exp: Date.now() + 60_000 },
      response,
      guests,
    });

  const headcount = async (eventId: string) =>
    (await prisma.rsvp.findMany({ where: { eventId, response: "yes" } })).reduce((n, r) => n + 1 + r.guests, 0);

  it("fills an event to its capacity and no further when families race", async () => {
    const event = await prisma.event.create({ data: { orgId, title: "Campout", startsAt: new Date(), capacity: 5 } });
    const results = await Promise.all(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((who) => rsvp(event.id, who, "yes", 1)),
    );
    // Two spots each: two families fit, the third would make six.
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok && r.reason === "full")).toHaveLength(6);
    expect(await headcount(event.id)).toBe(4);
    // The last spot still goes to someone coming alone.
    expect((await rsvp(event.id, "solo", "yes")).ok).toBe(true);
    expect(await headcount(event.id)).toBe(5);
  });

  it("lets anyone shrink or step back on a full event", async () => {
    const event = await prisma.event.create({ data: { orgId, title: "Hike", startsAt: new Date(), capacity: 3 } });
    expect((await rsvp(event.id, "big", "yes", 2)).ok).toBe(true);
    expect(await rsvp(event.id, "late", "yes")).toMatchObject({ ok: false, reason: "full", spotsLeft: 0 });
    expect((await rsvp(event.id, "late", "maybe")).ok).toBe(true);
    // A leader lowers capacity below what's booked; families can still edit down.
    await prisma.event.update({ where: { id: event.id }, data: { capacity: 2 } });
    expect((await rsvp(event.id, "big", "yes", 1)).ok).toBe(true);
    expect((await rsvp(event.id, "big", "yes", 2)).ok).toBe(false);
    expect((await rsvp(event.id, "big", "no")).ok).toBe(true);
    expect((await rsvp(event.id, "late", "yes")).ok).toBe(true);
  });

  it("lends each unit of an item once when leaders race", async () => {
    const item = await prisma.equipment.create({ data: { orgId, name: "Tent", quantity: 2 } });
    const member = await prisma.member.create({ data: { orgId, isYouth: true, email: `kid-${tag}@example.invalid` } });
    const lend = () =>
      lendIfAvailable({ orgId, equipmentId: item.id, memberId: member.id, dueAt: null, loanNotes: null });
    const results = await Promise.all(Array.from({ length: 6 }, lend));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(await prisma.equipmentLoan.count({ where: { equipmentId: item.id, returnedAt: null } })).toBe(2);

    const first = results.find((r) => r.ok);
    await prisma.equipmentLoan.update({
      where: { id: first && first.ok ? first.loanId : "" },
      data: { returnedAt: new Date() },
    });
    expect((await lend()).ok).toBe(true);
  });

  it("moves the waitlist up when a slot grows", async () => {
    const event = await prisma.event.create({ data: { orgId, title: "Badge day", startsAt: new Date() } });
    const slot = await prisma.signupSlot.create({
      data: { orgId, eventId: event.id, title: "Drivers", capacity: 1, allowWaitlist: true },
    });
    for (const who of ["one", "two", "three", "four"]) {
      await prisma.$transaction((tx) =>
        claimSlot(tx, { orgId, slotId: slot.id, userId: null, name: who, email: `${who}-${tag}@example.invalid`, notes: null }),
      );
    }
    await prisma.signupSlot.update({ where: { id: slot.id }, data: { capacity: 3 } });
    const promoted = await prisma.$transaction((tx) => fillFromWaitlist(tx, slot.id));
    expect(promoted).toHaveLength(2);
    const seated = await prisma.slotAssignment.findMany({
      where: { slotId: slot.id, waitlisted: false },
      orderBy: { createdAt: "asc" },
    });
    expect(seated.map((a) => a.name)).toEqual(["one", "two", "three"]);
  });
});
