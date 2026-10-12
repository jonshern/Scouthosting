// The hourly tick prunes expired sign-in rows. Skipped unless
// TEST_DATABASE_URL points at a migrated test database.

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { pruneAuthRows } from "./cron";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("cron tick sign-in housekeeping", () => {
  const tag = `cron-housekeeping-${Date.now()}`;

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: `${tag}@example.invalid` } });
    await prisma.verification.deleteMany({ where: { identifier: { startsWith: tag } } });
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: tag } } });
  });

  it("deletes expired sessions, used-up verifications and stale rate-limit rows, keeping live ones", async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60_000);
    const future = new Date(now.getTime() + 3_600_000);
    const user = await prisma.user.create({ data: { email: `${tag}@example.invalid`, displayName: "Housekeeping" } });
    await prisma.session.createMany({
      data: [
        { token: `${tag}-old`, userId: user.id, expiresAt: past },
        { token: `${tag}-live`, userId: user.id, expiresAt: future },
      ],
    });
    await prisma.verification.createMany({
      data: [
        { identifier: `${tag}-old`, value: "x", expiresAt: past },
        { identifier: `${tag}-live`, value: "x", expiresAt: future },
      ],
    });
    await prisma.rateLimit.createMany({
      data: [
        { key: `${tag}-old`, count: 1, lastRequest: BigInt(now.getTime() - 2 * 86_400_000) },
        { key: `${tag}-live`, count: 1, lastRequest: BigInt(now.getTime()) },
      ],
    });

    expect(await pruneAuthRows({ now, prismaClient: prisma })).toBeGreaterThanOrEqual(3);

    expect((await prisma.session.findMany({ where: { userId: user.id } })).map((s) => s.token)).toEqual([`${tag}-live`]);
    expect((await prisma.verification.findMany({ where: { identifier: { startsWith: tag } } })).map((v) => v.identifier)).toEqual([`${tag}-live`]);
    expect((await prisma.rateLimit.findMany({ where: { key: { startsWith: tag } } })).map((r) => r.key)).toEqual([`${tag}-live`]);
  });
});
