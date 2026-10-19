// Usage for the owner console: what each unit actually does in Compass,
// counted from its own records (events, chat messages, announcements and
// posts, photos, RSVPs, advancement sign-offs, people signing in), plus
// the platform totals and Lantern and app activity. Page views and visits
// are the analytics page's; this counts only real things people made.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { listUnits, type UnitRow } from "./console";

const DAY_MS = 24 * 60 * 60 * 1000;

export const USAGE_STATES = ["active", "quiet", "dormant", "not_started"] as const;
export type UsageState = (typeof USAGE_STATES)[number];

export const USAGE_STATE_LABEL: Record<UsageState, string> = {
  active: "Active",
  quiet: "Quiet",
  dormant: "Dormant",
  not_started: "Not started",
};

export type UsageCounts = {
  events: number;
  messages: number;
  posts: number;
  photos: number;
  rsvps: number;
  signoffs: number;
  peopleSignedIn: number;
};

export const USAGE_COUNT_LABEL: Record<keyof UsageCounts, string> = {
  events: "Events added",
  messages: "Chat messages",
  posts: "Announcements and posts",
  photos: "Photos",
  rsvps: "RSVPs",
  signoffs: "Requirement sign-offs",
  peopleSignedIn: "People signed in",
};

export type UnitUsage = {
  unit: UnitRow;
  counts: UsageCounts;
  upcomingEvents: number;
  lastActiveAt: Date | null;
  state: UsageState;
};

const ZERO: UsageCounts = { events: 0, messages: 0, posts: 0, photos: 0, rsvps: 0, signoffs: 0, peopleSignedIn: 0 };

/**
 * Active: something happened in the last 7 days. Quiet: in the window
 * but not this week. Not started: under two weeks old with nothing yet.
 * Dormant: everything else.
 */
export function usageState(
  lastActiveAt: Date | null,
  createdAt: Date,
  days: number,
  now: Date = new Date(),
): UsageState {
  const ago = (d: Date) => now.getTime() - d.getTime();
  if (lastActiveAt && ago(lastActiveAt) <= 7 * DAY_MS) return "active";
  if (lastActiveAt && ago(lastActiveAt) <= days * DAY_MS) return "quiet";
  if (!lastActiveAt && ago(createdAt) <= 14 * DAY_MS) return "not_started";
  return "dormant";
}

type Row = { orgId: string; n: bigint | number; last: Date | null };

// One SQL per kind of record: count in the window, and the newest ever.
async function perOrg(sql: Prisma.Sql): Promise<Map<string, { n: number; last: Date | null }>> {
  const rows = await prisma.$queryRaw<Row[]>(sql);
  return new Map(rows.map((r) => [r.orgId, { n: Number(r.n), last: r.last }]));
}

function maxDate(...ds: (Date | null | undefined)[]): Date | null {
  let out: Date | null = null;
  for (const d of ds) if (d && (!out || d > out)) out = d;
  return out;
}

export async function unitUsage(
  { days = 30, orgId }: { days?: number; orgId?: string } = {},
  now: Date = new Date(),
): Promise<UnitUsage[]> {
  const since = new Date(now.getTime() - days * DAY_MS);
  const only = orgId ? Prisma.sql`AND x."orgId" = ${orgId}` : Prisma.empty;
  const q = (table: string, at: string) =>
    perOrg(Prisma.sql`
      SELECT x."orgId", COUNT(*) FILTER (WHERE x.${Prisma.raw(`"${at}"`)} >= ${since}) AS n,
             MAX(x.${Prisma.raw(`"${at}"`)}) AS last
      FROM ${Prisma.raw(`"${table}"`)} x WHERE TRUE ${only} GROUP BY x."orgId"`);

  const [units, events, announcements, posts, photos, rsvps, signoffs, messages, signins, upcoming] = await Promise.all([
    listUnits({ orgId }, now),
    q("Event", "createdAt"),
    q("Announcement", "createdAt"),
    q("Post", "createdAt"),
    q("Photo", "createdAt"),
    q("Rsvp", "updatedAt"),
    q("RequirementProgress", "updatedAt"),
    perOrg(Prisma.sql`
      SELECT x."orgId", COUNT(*) FILTER (WHERE m."createdAt" >= ${since}) AS n, MAX(m."createdAt") AS last
      FROM "Message" m JOIN "Channel" x ON x.id = m."channelId"
      WHERE m."deletedAt" IS NULL ${only} GROUP BY x."orgId"`),
    // People in the unit signed in during the window (a live web session
    // or an app token used), and the latest of either.
    perOrg(Prisma.sql`
      SELECT x."orgId", COUNT(DISTINCT x."userId") FILTER (WHERE a.at >= ${since}) AS n, MAX(a.at) AS last
      FROM "OrgMembership" x
      JOIN (
        SELECT "userId", "updatedAt" AS at FROM "Session"
        UNION ALL
        SELECT "userId", "lastUsedAt" AS at FROM "ApiToken" WHERE "lastUsedAt" IS NOT NULL
      ) a ON a."userId" = x."userId"
      WHERE TRUE ${only} GROUP BY x."orgId"`),
    perOrg(Prisma.sql`
      SELECT x."orgId", COUNT(*) AS n, NULL::timestamp AS last
      FROM "Event" x WHERE x."startsAt" >= ${now} ${only} GROUP BY x."orgId"`),
  ]);

  const get = (m: Map<string, { n: number; last: Date | null }>, id: string) => m.get(id) ?? { n: 0, last: null };
  return units.map((unit) => {
    const id = unit.id;
    const counts: UsageCounts = {
      ...ZERO,
      events: get(events, id).n,
      messages: get(messages, id).n,
      posts: get(announcements, id).n + get(posts, id).n,
      photos: get(photos, id).n,
      rsvps: get(rsvps, id).n,
      signoffs: get(signoffs, id).n,
      peopleSignedIn: get(signins, id).n,
    };
    const lastActiveAt = maxDate(
      ...[events, announcements, posts, photos, rsvps, signoffs, messages, signins].map((m) => get(m, id).last),
    );
    return {
      unit,
      counts,
      upcomingEvents: get(upcoming, id).n,
      lastActiveAt,
      state: usageState(lastActiveAt, unit.createdAt, days, now),
    };
  });
}

export type PlatformUsage = {
  days: number;
  totals: UsageCounts;
  units: Record<UsageState, number>;
  /** Paying (or on free access) but nothing in the window: likely to cancel. */
  payingDormant: UnitUsage[];
  /** On trial and active this week: likely to convert. */
  trialActive: UnitUsage[];
  lantern: { stepsChecked: number; families: number; entries: number };
  /** Distinct accounts using each phone app in the window, by app token name. */
  apps: { compass: number; waypoint: number; lantern: number };
};

export function summarizeUsage(rows: UnitUsage[], days: number): Omit<PlatformUsage, "lantern" | "apps"> {
  const totals = { ...ZERO };
  const units = { active: 0, quiet: 0, dormant: 0, not_started: 0 } as Record<UsageState, number>;
  for (const r of rows) {
    if (r.unit.isDemo) continue;
    units[r.state] += 1;
    for (const k of Object.keys(totals) as (keyof UsageCounts)[]) totals[k] += r.counts[k];
  }
  const real = rows.filter((r) => !r.unit.isDemo);
  return {
    days,
    totals,
    units,
    payingDormant: real.filter(
      (r) => ["paid", "canceling", "past_due", "comped"].includes(r.unit.license.kind) && r.state === "dormant",
    ),
    trialActive: real.filter((r) => r.unit.license.kind === "trial" && r.state === "active"),
  };
}

export async function platformUsage({ days = 30 }: { days?: number } = {}, now: Date = new Date()): Promise<PlatformUsage & { rows: UnitUsage[] }> {
  const since = new Date(now.getTime() - days * DAY_MS);
  const [rows, steps, families, entries, apps] = await Promise.all([
    unitUsage({ days }, now),
    prisma.journeyProgress.count({ where: { updatedAt: { gte: since } } }),
    prisma.journeyScout.findMany({
      where: { progress: { some: { updatedAt: { gte: since } } } },
      distinct: ["ownerUserId"],
      select: { ownerUserId: true },
    }),
    prisma.journeyEntry.count({ where: { createdAt: { gte: since } } }),
    prisma.$queryRaw<{ app: string; n: bigint }[]>`
      SELECT split_part("name", ' ', 1) AS app, COUNT(DISTINCT "userId") AS n
      FROM "ApiToken" WHERE "lastUsedAt" >= ${since} GROUP BY 1`,
  ]);
  const appCount = (name: string) => Number(apps.find((a) => a.app.toLowerCase() === name)?.n ?? 0);
  return {
    ...summarizeUsage(rows, days),
    rows,
    lantern: { stepsChecked: steps, families: families.length, entries },
    apps: { compass: appCount("compass"), waypoint: appCount("waypoint"), lantern: appCount("lantern") },
  };
}
