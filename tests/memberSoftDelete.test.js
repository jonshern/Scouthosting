// Soft-delete contract for Member. Pins:
//   - the cron retention sweep deletes rows past the 30-day window,
//     leaves rows inside it
//   - the sweep is fault-tolerant (returns 0 on DB error)
//
// Doesn't try to round-trip Prisma — uses an in-memory fake. The
// query-filter changes (audienceFor, /admin/members default,
// /members directory) are exercised by the existing integration
// tests after migrating; their assertions don't change because the
// new where-clause filter just adds `deletedAt: null` to what's
// already an active-roster query.

import { describe, it, expect } from "vitest";
import { runCronTick } from "../lib/newsletterCron.js";

function fakePrisma({ members = [] } = {}) {
  return {
    newsletterSchedule: { findMany: async () => [] },
    newsletterRule: { findMany: async () => [] },
    errorLog: { deleteMany: async () => ({ count: 0 }) },
    member: {
      deleteMany: async ({ where }) => {
        const cutoff = where.deletedAt?.lt;
        const before = members.length;
        // Mutate the array in place so the caller can inspect.
        for (let i = members.length - 1; i >= 0; i--) {
          if (members[i].deletedAt && members[i].deletedAt < cutoff) members.splice(i, 1);
        }
        return { count: before - members.length };
      },
    },
  };
}

const NOW = new Date("2026-05-04T12:00:00Z");
const day = 86400000;
const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

describe("member soft-delete retention sweep", () => {
  it("purges members whose deletedAt is older than 30 days", async () => {
    const members = [
      { id: "m1", deletedAt: new Date(NOW.getTime() - 31 * day) }, // expired
      { id: "m2", deletedAt: new Date(NOW.getTime() - 90 * day) }, // way expired
      { id: "m3", deletedAt: new Date(NOW.getTime() - 5 * day) },  // still in grace
      { id: "m4", deletedAt: null },                                // active
    ];
    const prisma = fakePrisma({ members });
    const result = await runCronTick({ now: NOW, prismaClient: prisma, logger: silentLogger });
    expect(result.trashedMembersPurged).toBe(2);
    expect(members.map((m) => m.id).sort()).toEqual(["m3", "m4"]);
  });

  it("returns 0 when nothing has aged out yet", async () => {
    const members = [
      { id: "m1", deletedAt: new Date(NOW.getTime() - 5 * day) },
      { id: "m2", deletedAt: null },
    ];
    const prisma = fakePrisma({ members });
    const result = await runCronTick({ now: NOW, prismaClient: prisma, logger: silentLogger });
    expect(result.trashedMembersPurged).toBe(0);
    expect(members).toHaveLength(2);
  });

  it("doesn't fail the tick if the sweep query throws", async () => {
    const prisma = fakePrisma();
    prisma.member.deleteMany = async () => { throw new Error("simulated DB error"); };
    const result = await runCronTick({ now: NOW, prismaClient: prisma, logger: silentLogger });
    expect(result.trashedMembersPurged).toBe(0);
    // Other tick fields still populated.
    expect(result.schedulesDrafted).toBe(0);
  });

  it("the 30-day boundary is respected — exactly 30 days old stays, 30+1ms is purged", async () => {
    const members = [
      { id: "edge1", deletedAt: new Date(NOW.getTime() - 30 * day) },          // exactly 30d
      { id: "edge2", deletedAt: new Date(NOW.getTime() - 30 * day - 1) },      // 30d + 1ms
    ];
    const prisma = fakePrisma({ members });
    const result = await runCronTick({ now: NOW, prismaClient: prisma, logger: silentLogger });
    // The where clause is `deletedAt: { lt: cutoff }` so exactly-30d
    // matches NOT (>= cutoff stays). Anything older is purged.
    expect(result.trashedMembersPurged).toBe(1);
    expect(members.map((m) => m.id)).toEqual(["edge1"]);
  });
});
