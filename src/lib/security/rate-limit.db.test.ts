// Runs against a real Postgres: TEST_DATABASE_URL=... npm test
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { rateLimit, resetRateLimit, sweepExpired } from "./rate-limit";

const db = !!process.env.TEST_DATABASE_URL;
const P = `test:${process.pid}:`;

describe.skipIf(!db)("rateLimit (Postgres)", () => {
  beforeEach(async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: P } } });
  });
  afterAll(async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: P } } });
  });

  it("allows up to the limit then denies, with time to reset", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(`${P}a`, 3, 60_000));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[2].remaining).toBe(0);
    expect(results[3].resetMs).toBeGreaterThan(55_000);
  });

  it("is exact under concurrency (one shared counter, no lost updates)", async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, () => rateLimit(`${P}burst`, 10, 60_000)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(10);
    const row = await prisma.rateLimitBucket.findUnique({ where: { key: `${P}burst` } });
    expect(row?.count).toBe(40);
  });

  it("starts a fresh window once the old one has passed", async () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    expect((await rateLimit(`${P}w`, 1, 1000, { now: t0 })).ok).toBe(true);
    expect((await rateLimit(`${P}w`, 1, 1000, { now: new Date(t0.getTime() + 500) })).ok).toBe(false);
    expect((await rateLimit(`${P}w`, 1, 1000, { now: new Date(t0.getTime() + 1500) })).ok).toBe(true);
  });

  it("isolates keys, resets, and sweeps expired buckets", async () => {
    await rateLimit(`${P}x`, 1, 60_000);
    expect((await rateLimit(`${P}y`, 1, 60_000)).ok).toBe(true);
    expect((await rateLimit(`${P}x`, 1, 60_000)).ok).toBe(false);
    await resetRateLimit(`${P}x`);
    expect((await rateLimit(`${P}x`, 1, 60_000)).ok).toBe(true);

    await rateLimit(`${P}old`, 1, 1, { now: new Date("2020-01-01T00:00:00Z") });
    await sweepExpired();
    expect(await prisma.rateLimitBucket.findUnique({ where: { key: `${P}old` } })).toBeNull();
    expect(await prisma.rateLimitBucket.findUnique({ where: { key: `${P}x` } })).not.toBeNull();
  });
});
