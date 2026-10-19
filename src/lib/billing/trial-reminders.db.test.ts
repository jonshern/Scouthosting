// The trial-end sweep against a real database: picks the trial ending
// within a week whose owner has no card on file, skips comped units,
// and sends once. Runs only with TEST_DATABASE_URL set. `now` is far in
// the future so other tests' units (sharing this database) never match.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { runTrialReminderSweep } from "./trial-reminders";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}`;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2090-03-01T12:00:00Z");

describe.skipIf(!db)("trial reminder sweep", () => {
  const orgIds: string[] = [];
  let ownerId = "";

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `trial-owner-${S}@example.invalid`, displayName: "Trial Owner" } })).id;
    const mk = (tag: string, extra: object) =>
      prisma.org.create({
        data: {
          slug: `trialrem${tag}${S}`,
          unitType: "Troop",
          unitNumber: "9",
          displayName: `Troop ${tag}`,
          charterOrg: "Test",
          city: "Minneapolis",
          state: "MN",
          scoutmasterName: "Trial Owner",
          scoutmasterEmail: `trial-owner-${S}@example.invalid`,
          ownerId,
          trialEndsAt: new Date(NOW.getTime() + 5 * DAY),
          ...extra,
        },
      });
    orgIds.push((await mk("due", {})).id);
    orgIds.push((await mk("comped", { compedUntil: new Date(NOW.getTime() + 300 * DAY) })).id);
    orgIds.push((await mk("later", { trialEndsAt: new Date(NOW.getTime() + 40 * DAY) })).id);
  });

  afterAll(async () => {
    await prisma.org.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  it("reminds the owner of the unit ending within a week, once", async () => {
    const send = vi.fn(async () => ({ ok: true as const }));
    expect(await runTrialReminderSweep({ prisma, stripeConfigured: true, now: NOW, send })).toEqual({ reminded: 1, failed: 0 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ email: `trial-owner-${S}@example.invalid`, org: expect.objectContaining({ displayName: "Troop due" }) }));
    const logged = await prisma.auditLog.count({ where: { orgId: orgIds[0], action: "trial:reminded:7" } });
    expect(logged).toBe(1);

    const again = vi.fn(async () => ({ ok: true as const }));
    await runTrialReminderSweep({ prisma, stripeConfigured: true, now: NOW, send: again });
    expect(again).not.toHaveBeenCalled();
  });
});
