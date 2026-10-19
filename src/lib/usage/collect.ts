// Usage tracking: the write path. Apps and the landing page post page
// views and key actions to POST /api/v1/usage (ingest below); server
// code records key actions it knows about with recordAction(). Nothing
// here may throw into a caller: tracking that fails is dropped.
//
// Visitors are counted without cookies: visitorHash is
// sha256(today's salt, IP, user agent). The salt lives in UsageSalt,
// one per UTC day, and the nightly sweep deletes old ones, so a hash
// can't be recomputed or linked to the next day's.

import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { logger } from "@/lib/log";
import {
  cleanPath,
  cleanProps,
  cleanSource,
  deviceInfo,
  referrerHost,
  type UsagePlatform,
  type UsageProduct,
  type UsageRole,
} from "./events";

const log = logger.child("usage");

/** Raw usage rows are kept this long, then the nightly sweep deletes them. */
export const USAGE_RETENTION_MONTHS = 13;

const saltCache = new Map<string, string>();

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

async function saltFor(day: string, db: PrismaClient): Promise<string> {
  const cached = saltCache.get(day);
  if (cached) return cached;
  const fresh = randomBytes(32).toString("hex");
  // Two instances may race to make the day's salt; the first one wins
  // and both read it back.
  await db.usageSalt.upsert({ where: { day }, create: { day, salt: fresh }, update: {} });
  const row = await db.usageSalt.findUniqueOrThrow({ where: { day } });
  saltCache.clear();
  saltCache.set(day, row.salt);
  return row.salt;
}

export function hashVisitor(salt: string, ip: string, ua: string): string {
  return createHash("sha256").update(`${salt}\n${ip}\n${ua}`).digest("hex").slice(0, 32);
}

export type IncomingEvent = {
  name: string;
  path?: string | null;
  referrer?: string | null;
  source?: string | null;
  props?: unknown;
};

export type Who = {
  role: UsageRole;
  userId?: string | null;
  orgId?: string | null;
  scoutId?: string | null;
};

export type Origin = {
  product: UsageProduct;
  platform: UsagePlatform;
  ip: string | null;
  userAgent: string | null;
  /** The site's own host, so self-referrals aren't counted. */
  host?: string | null;
};

/** Turns events from one request into rows. Pure apart from the salt lookup. */
export async function buildRows(
  events: IncomingEvent[],
  origin: Origin,
  who: Who,
  opts: { now?: Date; prismaClient?: PrismaClient; orgIdForSlug?: (slug: string) => Promise<string | null> } = {},
): Promise<Prisma.UsageEventCreateManyInput[]> {
  const now = opts.now ?? new Date();
  const db = opts.prismaClient ?? defaultPrisma;
  const { device, browser } = deviceInfo(origin.userAgent, origin.platform);
  // Scouts are never given a visitor hash, signed in or not.
  const visitorHash =
    who.role !== "scout" && origin.ip
      ? hashVisitor(await saltFor(utcDay(now), db), origin.ip, origin.userAgent ?? "")
      : null;
  const rows: Prisma.UsageEventCreateManyInput[] = [];
  for (const e of events) {
    const { path, slug } = cleanPath(e.path);
    let orgId = who.orgId ?? null;
    if (!orgId && slug && opts.orgIdForSlug) orgId = await opts.orgIdForSlug(slug);
    const props = cleanProps(e.props);
    rows.push({
      createdAt: now,
      product: origin.product,
      platform: origin.platform,
      name: e.name,
      path,
      referrer: referrerHost(e.referrer, origin.host),
      source: cleanSource(e.source),
      device,
      browser,
      role: who.role,
      visitorHash,
      props: props ?? undefined,
      userId: who.userId ?? null,
      orgId,
      scoutId: who.scoutId ?? null,
    });
  }
  return rows;
}

/** Writes events from the collect route. Never throws. */
export async function ingest(
  events: IncomingEvent[],
  origin: Origin,
  who: Who,
  opts: { now?: Date; prismaClient?: PrismaClient } = {},
): Promise<number> {
  const db = opts.prismaClient ?? defaultPrisma;
  try {
    const slugCache = new Map<string, string | null>();
    const rows = await buildRows(events, origin, who, {
      ...opts,
      orgIdForSlug: async (slug) => {
        if (!slugCache.has(slug)) {
          const org = await db.org.findUnique({ where: { slug }, select: { id: true } });
          slugCache.set(slug, org?.id ?? null);
        }
        return slugCache.get(slug) ?? null;
      },
    });
    if (!rows.length) return 0;
    const r = await db.usageEvent.createMany({ data: rows });
    return r.count;
  } catch (err) {
    log.warn("usage ingest failed", { err: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

/**
 * A key action the server saw happen (a unit trial started, a badge-day
 * sign-up, a requirement checked off). Fire and forget: returns at once
 * and never throws.
 */
export function recordAction(
  name: string,
  args: {
    product: UsageProduct;
    role?: UsageRole;
    userId?: string | null;
    orgId?: string | null;
    scoutId?: string | null;
    props?: Record<string, string | number | boolean>;
  },
  prismaClient: PrismaClient = defaultPrisma,
): void {
  const props = cleanProps(args.props);
  const failed = (err: unknown) =>
    log.warn("usage action not recorded", { name, err: err instanceof Error ? err.message : String(err) });
  try {
    void prismaClient.usageEvent
      .create({
        data: {
          product: args.product,
          // Seen by the server, not sent by an app.
          platform: "server",
          name,
          role: args.role ?? (args.userId ? "adult" : "visitor"),
          userId: args.userId ?? null,
          orgId: args.orgId ?? null,
          scoutId: args.scoutId ?? null,
          props: props ?? undefined,
        },
      })
      .catch(failed);
  } catch (err) {
    failed(err);
  }
}

/** Nightly: drop rows older than the retention window and every salt but today's. */
export async function sweepUsage(
  { now = new Date(), prismaClient = defaultPrisma }: { now?: Date; prismaClient?: PrismaClient } = {},
): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - USAGE_RETENTION_MONTHS);
  const [events] = await Promise.all([
    prismaClient.usageEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prismaClient.usageSalt.deleteMany({ where: { day: { lt: utcDay(now) } } }),
  ]);
  return events.count;
}
