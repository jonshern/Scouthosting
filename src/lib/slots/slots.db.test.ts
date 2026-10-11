// Concurrency check for the slot row lock against a real Postgres.
// Skipped unless TEST_DATABASE_URL points at a migrated test database
// (CI's e2e job sets it; locally use the compass_test DB).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { claimSlot, releaseSlot } from "./index";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("slots against Postgres", () => {
  // Built lazily: the collector runs this body even when skipped.
  let prisma: PrismaClient;
  const tag = `slots-db-${Date.now()}`;
  let orgId = "";
  let eventId = "";

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const org = await prisma.org.create({
      data: {
        slug: tag,
        unitType: "Troop",
        unitNumber: "999",
        displayName: "Slots test",
        charterOrg: "Test",
        city: "Test",
        state: "TS",
        scoutmasterName: "Test",
        scoutmasterEmail: `${tag}@example.invalid`,
      },
    });
    orgId = org.id;
    const event = await prisma.event.create({
      data: { orgId, title: "Slots test", startsAt: new Date() },
    });
    eventId = event.id;
  });

  afterAll(async () => {
    await prisma?.org.delete({ where: { id: orgId } }).catch(() => {});
    await prisma?.$disconnect();
  });

  async function newSlot(capacity: number, allowWaitlist: boolean) {
    return prisma.signupSlot.create({
      data: { orgId, eventId, title: "Drivers", capacity, allowWaitlist },
    });
  }

  it("20 simultaneous claims on a 3-seat slot fill exactly 3 seats", async () => {
    const slot = await newSlot(3, true);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        prisma.$transaction((tx) =>
          claimSlot(tx, {
            orgId,
            slotId: slot.id,
            userId: null,
            name: `Guest ${i}`,
            email: `g${i}-${tag}@example.invalid`,
            notes: null,
          }),
        ),
      ),
    );
    expect(results.filter((r) => !r.waitlisted)).toHaveLength(3);
    const active = await prisma.slotAssignment.count({
      where: { slotId: slot.id, waitlisted: false },
    });
    expect(active).toBe(3);
  });

  it("simultaneous releases promote exactly one waitlister each", async () => {
    const slot = await newSlot(2, true);
    for (let i = 0; i < 5; i++) {
      await prisma.$transaction((tx) =>
        claimSlot(tx, {
          orgId,
          slotId: slot.id,
          userId: null,
          name: `G${i}`,
          email: `r${i}-${tag}@example.invalid`,
          notes: null,
        }),
      );
    }
    await Promise.all(
      [0, 1].map((i) =>
        prisma.$transaction((tx) =>
          releaseSlot(tx, {
            slotId: slot.id,
            who: { guestEmail: `r${i}-${tag}@example.invalid` },
          }),
        ),
      ),
    );
    const rows = await prisma.slotAssignment.findMany({
      where: { slotId: slot.id },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.filter((r) => !r.waitlisted).map((r) => r.email)).toEqual([
      `r2-${tag}@example.invalid`,
      `r3-${tag}@example.invalid`,
    ]);
    expect(rows.filter((r) => r.waitlisted)).toHaveLength(1);
  });
});
