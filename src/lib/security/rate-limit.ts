// Rate limiting.
//
// `rateLimit()` is the one to use. It keeps fixed-window counters in
// Postgres (RateLimitBucket), so every app instance shares the same
// budget and a restart doesn't hand an attacker a fresh window. Each
// call is a single atomic upsert; expired rows are swept
// opportunistically.

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { logger } from "@/lib/log";

const log = logger.child("rate-limit");

export type RateLimitResult = { ok: boolean; remaining: number; resetMs: number };

const SWEEP_PROBABILITY = 0.01;

/**
 * Count one hit against `key` and report whether it is within `limit`
 * hits per `windowMs`. Fails open (allows the request) if the database
 * call itself fails, so a limiter hiccup never takes the API down; the
 * failure is logged.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  opts: { prismaClient?: PrismaClient; now?: Date } = {},
): Promise<RateLimitResult> {
  const db = opts.prismaClient ?? defaultPrisma;
  const now = opts.now ?? new Date();
  const freshReset = new Date(now.getTime() + windowMs);
  try {
    const rows = await db.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${freshReset})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now}
                       THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now}
                         THEN EXCLUDED."resetAt" ELSE "RateLimitBucket"."resetAt" END
      RETURNING "count", "resetAt"`;
    const row = rows[0];
    if (Math.random() < SWEEP_PROBABILITY) void sweepExpired(db, now);
    const count = Number(row.count);
    const resetMs = Math.max(0, new Date(row.resetAt).getTime() - now.getTime());
    return { ok: count <= limit, remaining: Math.max(0, limit - count), resetMs };
  } catch (err) {
    log.warn("store unavailable, allowing request", { key, err });
    return { ok: true, remaining: limit, resetMs: windowMs };
  }
}

/**
 * One hit against `key` for the public (no sign-in) routes: null when
 * allowed, else the whole seconds until the window resets, for a 429
 * with Retry-After.
 */
export async function retryAfterIfLimited(
  key: string,
  l: { limit: number; windowMs: number },
): Promise<number | null> {
  const r = await rateLimit(key, l.limit, l.windowMs);
  return r.ok ? null : Math.max(1, Math.ceil(r.resetMs / 1000));
}

/** Delete buckets whose window has passed. Safe to call any time. */
export async function sweepExpired(
  db: PrismaClient = defaultPrisma,
  now: Date = new Date(),
): Promise<number> {
  try {
    const r = await db.rateLimitBucket.deleteMany({ where: { resetAt: { lte: now } } });
    return r.count;
  } catch (err) {
    log.warn("sweep failed", { err });
    return 0;
  }
}

/** Clear one bucket (e.g. after a successful sign-in). */
export async function resetRateLimit(
  key: string,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  await db.rateLimitBucket.deleteMany({ where: { key } });
}
