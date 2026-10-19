// Usage tracking: the owner console's reads (/super-admin/analytics).
// Everything takes a window (days back from now) and an optional
// product, and works from UsageEvent rows alone, except the sign-up
// funnel, which also counts accounts, units and payments from their own
// tables.
//
// Words used on the pages:
// - a visitor is one person on one day: a signed-in account, or a
//   signed-out browser's daily hash. Someone back on two days counts
//   twice, because the hash changes every day by design.
// - a visit is a run of views with no gap over 30 minutes.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { VIEW, type UsageProduct } from "./events";

const DAY_MS = 24 * 60 * 60 * 1000;

export type Window = { days: number; product?: UsageProduct | null; orgId?: string | null; now?: Date };

function since({ days, now = new Date() }: Window): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

function filters(w: Window): Prisma.Sql {
  const parts = [Prisma.sql`"createdAt" >= ${since(w)}`];
  if (w.product) parts.push(Prisma.sql`"product" = ${w.product}`);
  if (w.orgId) parts.push(Prisma.sql`"orgId" = ${w.orgId}`);
  return Prisma.join(parts, " AND ");
}

// Who a row belongs to, for counting people: the account, else the
// scout's trail, else the day's hash. Rows with none of these (a scout
// device that isn't paired, server actions by nobody) aren't counted.
const ACTOR = Prisma.sql`COALESCE("userId", 's:' || "scoutId", 'v:' || "visitorHash")`;

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

export type Totals = {
  visitors: number;
  views: number;
  visits: number;
  signedIn: number;
  scoutDevices: number;
  actions: number;
};

export async function totals(w: Window): Promise<Totals> {
  const where = filters(w);
  const [row] = await prisma.$queryRaw<
    { visitors: bigint; views: bigint; signed_in: bigint; scouts: bigint; actions: bigint }[]
  >`
    SELECT
      (SELECT COUNT(*) FROM (SELECT DISTINCT date_trunc('day', "createdAt"), ${ACTOR} FROM "UsageEvent"
        WHERE ${where} AND "name" = ${VIEW} AND ${ACTOR} IS NOT NULL) d) AS visitors,
      COUNT(*) FILTER (WHERE "name" = ${VIEW}) AS views,
      COUNT(DISTINCT "userId") AS signed_in,
      COUNT(DISTINCT "scoutId") AS scouts,
      COUNT(*) FILTER (WHERE "name" <> ${VIEW}) AS actions
    FROM "UsageEvent" WHERE ${where}`;
  const [visits] = await prisma.$queryRaw<{ visits: bigint }[]>`
    SELECT COUNT(*) FILTER (WHERE prev IS NULL OR "createdAt" - prev > interval '30 minutes') AS visits
    FROM (
      SELECT "createdAt", LAG("createdAt") OVER (PARTITION BY ${ACTOR} ORDER BY "createdAt") AS prev
      FROM "UsageEvent" WHERE ${where} AND "name" = ${VIEW} AND ${ACTOR} IS NOT NULL
    ) t`;
  return {
    visitors: n(row?.visitors),
    views: n(row?.views),
    visits: n(visits?.visits),
    signedIn: n(row?.signed_in),
    scoutDevices: n(row?.scouts),
    actions: n(row?.actions),
  };
}

/** Visitors in the last `minutes`, for "right now". */
export async function liveVisitors(minutes = 30, now: Date = new Date()): Promise<number> {
  const [row] = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(DISTINCT ${ACTOR}) AS c FROM "UsageEvent"
    WHERE "createdAt" >= ${new Date(now.getTime() - minutes * 60_000)} AND "name" = ${VIEW}`;
  return n(row?.c);
}

export type DayRow = { day: string; visitors: number; views: number };

export async function byDay(w: Window): Promise<DayRow[]> {
  const rows = await prisma.$queryRaw<{ day: Date; visitors: bigint; views: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS day,
      COUNT(DISTINCT ${ACTOR}) AS visitors, COUNT(*) AS views
    FROM "UsageEvent" WHERE ${filters(w)} AND "name" = ${VIEW}
    GROUP BY 1 ORDER BY 1`;
  const have = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));
  // Every day in the window, zeros included, so the chart doesn't skip.
  const out: DayRow[] = [];
  const end = w.now ?? new Date();
  for (let i = w.days - 1; i >= 0; i--) {
    const day = new Date(end.getTime() - i * DAY_MS).toISOString().slice(0, 10);
    const r = have.get(day);
    out.push({ day, visitors: n(r?.visitors), views: n(r?.views) });
  }
  return out;
}

export type ProductRow = { product: string; visitors: number; views: number; signedIn: number; actions: number };

export async function byProduct(w: Window): Promise<ProductRow[]> {
  const rows = await prisma.$queryRaw<
    { product: string; visitors: bigint; views: bigint; signed_in: bigint; actions: bigint }[]
  >`
    SELECT "product",
      COUNT(DISTINCT CASE WHEN "name" = ${VIEW} THEN date_trunc('day', "createdAt")::text || ${ACTOR} END) AS visitors,
      COUNT(*) FILTER (WHERE "name" = ${VIEW}) AS views,
      COUNT(DISTINCT "userId") AS signed_in,
      COUNT(*) FILTER (WHERE "name" <> ${VIEW}) AS actions
    FROM "UsageEvent" WHERE ${filters(w)}
    GROUP BY 1 ORDER BY 3 DESC`;
  return rows.map((r) => ({
    product: r.product,
    visitors: n(r.visitors),
    views: n(r.views),
    signedIn: n(r.signed_in),
    actions: n(r.actions),
  }));
}

export type PageRow = { product: string; path: string; views: number; visitors: number };

export async function topPages(w: Window, limit = 25): Promise<PageRow[]> {
  const rows = await prisma.$queryRaw<{ product: string; path: string; views: bigint; visitors: bigint }[]>`
    SELECT "product", COALESCE("path", '/') AS path, COUNT(*) AS views,
      COUNT(DISTINCT date_trunc('day', "createdAt")::text || ${ACTOR}) AS visitors
    FROM "UsageEvent" WHERE ${filters(w)} AND "name" = ${VIEW}
    GROUP BY 1, 2 ORDER BY 3 DESC LIMIT ${limit}`;
  return rows.map((r) => ({ product: r.product, path: r.path, views: n(r.views), visitors: n(r.visitors) }));
}

export type CountRow = { label: string; count: number };

async function countBy(column: "referrer" | "source" | "device" | "browser" | "platform", w: Window, limit = 10): Promise<CountRow[]> {
  const col = Prisma.raw(`"${column}"`);
  const rows = await prisma.$queryRaw<{ label: string; c: bigint }[]>`
    SELECT ${col} AS label, COUNT(DISTINCT date_trunc('day', "createdAt")::text || ${ACTOR}) AS c
    FROM "UsageEvent" WHERE ${filters(w)} AND "name" = ${VIEW} AND ${col} IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT ${limit}`;
  return rows.map((r) => ({ label: r.label, count: n(r.c) }));
}

export const referrers = (w: Window) => countBy("referrer", w);
export const sources = (w: Window) => countBy("source", w);
export const devices = (w: Window) => countBy("device", w);
export const browsers = (w: Window) => countBy("browser", w);
export const platforms = (w: Window) => countBy("platform", w);

export type ActionRow = { name: string; product: string; count: number; people: number };

export async function actions(w: Window): Promise<ActionRow[]> {
  const rows = await prisma.$queryRaw<{ name: string; product: string; c: bigint; people: bigint }[]>`
    SELECT "name", "product", COUNT(*) AS c, COUNT(DISTINCT ${ACTOR}) AS people
    FROM "UsageEvent" WHERE ${filters(w)} AND "name" <> ${VIEW}
    GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 40`;
  return rows.map((r) => ({ name: r.name, product: r.product, count: n(r.c), people: n(r.people) }));
}

export type FunnelStep = { label: string; count: number; hint: string };

/**
 * From a look at the landing page to a paying unit. The first two steps
 * are visitors (per day); the rest are rows created in the window.
 */
export async function signupFunnel(w: Window): Promise<FunnelStep[]> {
  const from = since(w);
  const visitorsOn = async (product: UsageProduct, path?: string) => {
    const [row] = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(DISTINCT date_trunc('day', "createdAt")::text || ${ACTOR}) AS c FROM "UsageEvent"
      WHERE "createdAt" >= ${from} AND "product" = ${product} AND "name" = ${VIEW}
      ${path ? Prisma.sql`AND "path" = ${path}` : Prisma.empty}`;
    return n(row?.c);
  };
  const [landing, start, accounts, units, paid] = await Promise.all([
    visitorsOn("landing"),
    visitorsOn("compass", "/start"),
    prisma.user.count({ where: { createdAt: { gte: from } } }),
    prisma.org.count({ where: { createdAt: { gte: from }, isDemo: false, trialEndsAt: { not: null } } }),
    prisma.billingPayment
      .groupBy({ by: ["orgId"], where: { paidAt: { gte: from }, orgId: { not: null } } })
      .then((g) => g.length),
  ]);
  return [
    { label: "Looked at the landing page", count: landing, hint: "visitors" },
    { label: "Opened sign-up (/start)", count: start, hint: "visitors" },
    { label: "Made an account", count: accounts, hint: "every product" },
    { label: "Started a unit trial", count: units, hint: "units" },
    { label: "Paid", count: paid, hint: "units with a payment" },
  ];
}

export type UnitActivity = {
  orgId: string;
  slug: string;
  displayName: string;
  views: number;
  people: number;
  actions: number;
  lastSeen: Date;
};

export async function unitActivity(w: Window, limit = 30): Promise<UnitActivity[]> {
  const rows = await prisma.$queryRaw<
    { orgId: string; views: bigint; people: bigint; actions: bigint; last: Date }[]
  >`
    SELECT "orgId", COUNT(*) FILTER (WHERE "name" = ${VIEW}) AS views,
      COUNT(DISTINCT "userId") AS people,
      COUNT(*) FILTER (WHERE "name" <> ${VIEW}) AS actions, MAX("createdAt") AS last
    FROM "UsageEvent" WHERE ${filters(w)} AND "orgId" IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC, 5 DESC LIMIT ${limit}`;
  const orgs = await prisma.org.findMany({
    where: { id: { in: rows.map((r) => r.orgId) } },
    select: { id: true, slug: true, displayName: true },
  });
  const byId = new Map(orgs.map((o) => [o.id, o]));
  return rows.flatMap((r) => {
    const o = byId.get(r.orgId);
    return o
      ? [{ orgId: o.id, slug: o.slug, displayName: o.displayName, views: n(r.views), people: n(r.people), actions: n(r.actions), lastSeen: r.last }]
      : [];
  });
}

export type PersonActivity = {
  userId: string;
  displayName: string;
  email: string;
  products: string[];
  views: number;
  actions: number;
  lastSeen: Date;
};

/** The signed-in adults who used things most. Scouts aren't listed by name. */
export async function activePeople(w: Window, limit = 30): Promise<PersonActivity[]> {
  const rows = await prisma.$queryRaw<
    { userId: string; products: string[]; views: bigint; actions: bigint; last: Date }[]
  >`
    SELECT "userId", ARRAY_AGG(DISTINCT "product") AS products,
      COUNT(*) FILTER (WHERE "name" = ${VIEW}) AS views,
      COUNT(*) FILTER (WHERE "name" <> ${VIEW}) AS actions, MAX("createdAt") AS last
    FROM "UsageEvent" WHERE ${filters(w)} AND "userId" IS NOT NULL AND "role" = 'adult'
    GROUP BY 1 ORDER BY 5 DESC LIMIT ${limit}`;
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, displayName: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.flatMap((r) => {
    const u = byId.get(r.userId);
    return u
      ? [{ userId: u.id, displayName: u.displayName, email: u.email, products: r.products.sort(), views: n(r.views), actions: n(r.actions), lastSeen: r.last }]
      : [];
  });
}

export type TimelineRow = {
  id: string;
  createdAt: Date;
  product: string;
  platform: string;
  name: string;
  path: string | null;
  device: string | null;
  org: { slug: string; displayName: string } | null;
};

/** One adult's recent page views and actions, newest first. */
export async function personTimeline(userId: string, limit = 200): Promise<TimelineRow[]> {
  const rows = await prisma.usageEvent.findMany({
    where: { userId, role: "adult" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      product: true,
      platform: true,
      name: true,
      path: true,
      device: true,
      org: { select: { slug: true, displayName: true } },
    },
  });
  return rows;
}

/** Recent visits from signed-out visitors, grouped by their daily hash. */
export async function recentVisits(w: Window, limit = 20) {
  const rows = await prisma.$queryRaw<
    { hash: string; first: Date; last: Date; views: bigint; products: string[]; device: string | null; referrer: string | null; source: string | null; paths: string[] }[]
  >`
    SELECT "visitorHash" AS hash, MIN("createdAt") AS first, MAX("createdAt") AS last, COUNT(*) AS views,
      ARRAY_AGG(DISTINCT "product") AS products, MIN("device") AS device, MIN("referrer") AS referrer, MIN("source") AS source,
      (ARRAY_AGG(COALESCE("path", '/') ORDER BY "createdAt"))[1:8] AS paths
    FROM "UsageEvent"
    WHERE ${filters(w)} AND "name" = ${VIEW} AND "userId" IS NULL AND "visitorHash" IS NOT NULL
    GROUP BY 1 ORDER BY 3 DESC LIMIT ${limit}`;
  return rows.map((r) => ({ ...r, views: n(r.views) }));
}
