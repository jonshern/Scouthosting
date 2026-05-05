// Privacy-conscious analytics. Compass deals with minors' data, so
// we don't ship a third-party tracker, don't store IPs or
// user-agents, and don't follow users across the web. What we do
// measure is server-side, aggregated, and scoped to the org.
//
// Each event is one AuditLog row of action="analytics:<event>" with
// `summary` carrying a JSON payload of dimensions.

import type { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/log";
import { prisma as defaultPrisma } from "@/lib/db";

const log = logger.child("analytics");
const ANALYTICS_PREFIX = "analytics:";

export const EVENTS = {
  PAGE_VIEW: "page-view",
  ELEMENT_CLICKED: "element-clicked",
  CLIENT_ERROR: "client-error",
  FETCH_FAILED: "fetch-failed",
  ORG_PROVISIONED: "org-provisioned",
  USER_SIGNED_UP: "user-signed-up",
  USER_VERIFIED_EMAIL: "user-verified-email",
  RSVP_SUBMITTED: "rsvp-submitted",
  EVENT_PUBLISHED: "event-published",
  NEWSLETTER_SENT: "newsletter-sent",
  BROADCAST_SENT: "broadcast-sent",
  REIMBURSEMENT_APPROVED: "reimbursement-approved",
  CHANNEL_SUSPENDED: "channel-suspended",
  CHANNEL_UNSUSPENDED: "channel-unsuspended",
} as const;

const EVENT_NAMES = new Set<string>(Object.values(EVENTS));

function serialiseDimensions(dims: Record<string, unknown>): string | null {
  try {
    const json = JSON.stringify(dims || {});
    return json.length > 500 ? json.slice(0, 497) + "..." : json;
  } catch {
    return null;
  }
}

function parseDims(summary: string | null): Record<string, unknown> | null {
  if (!summary) return null;
  try {
    return JSON.parse(summary);
  } catch {
    try {
      const trimmed = summary.replace(/\.\.\.$/, "");
      return JSON.parse(trimmed + (trimmed.endsWith("}") ? "" : '"}'));
    } catch {
      return null;
    }
  }
}

export async function track(
  event: string,
  args: { orgId?: string | null; userId?: string | null; dimensions?: Record<string, unknown> } = {},
  prisma: PrismaClient = defaultPrisma,
): Promise<void> {
  if (!EVENT_NAMES.has(event)) {
    log.warn("unknown event name; ignored", { event });
    return;
  }
  try {
    await prisma.auditLog.create({
      data: {
        orgId: args.orgId ?? null,
        userId: args.userId ?? null,
        userDisplay: null,
        entityType: "Analytics",
        entityId: null,
        action: `analytics:${event}`,
        summary: serialiseDimensions(args.dimensions ?? {}),
      },
    });
  } catch (e) {
    log.warn("failed to record analytics event", { event, err: e });
  }
}

function analyticsWhere(args: {
  orgId?: string | null;
  since?: Date;
  until?: Date;
  action?: string;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (args.action) out.action = args.action;
  else out.action = { startsWith: ANALYTICS_PREFIX };
  if (args.orgId !== undefined) out.orgId = args.orgId;
  if (args.since && args.until) out.createdAt = { gte: args.since, lte: args.until };
  else if (args.since) out.createdAt = { gte: args.since };
  else if (args.until) out.createdAt = { lte: args.until };
  return out;
}

export async function rollup(
  args: { orgId?: string | null; since?: Date; until?: Date },
  prisma: PrismaClient = defaultPrisma,
): Promise<Array<{ event: string; count: number }>> {
  const where = analyticsWhere({
    orgId: args.orgId,
    since: args.since,
    until: args.until,
  }) as never;
  const rows = await prisma.auditLog.groupBy({
    by: ["action"],
    where,
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ event: r.action.replace(/^analytics:/, ""), count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

export async function summarize(
  args: { orgId?: string | null; since?: Date; until?: Date } = {},
  prisma: PrismaClient = defaultPrisma,
) {
  const where = analyticsWhere(args);
  const rows = await prisma.auditLog.groupBy({
    by: ["action"],
    where: where as never,
    _count: { _all: true },
  });
  const counts: Record<string, number> = Object.fromEntries(
    rows.map((r) => [r.action.replace(/^analytics:/, ""), r._count._all]),
  );
  const pageViews = await prisma.auditLog.findMany({
    where: { ...(where as object), action: "analytics:page-view" } as never,
    select: { summary: true },
  });
  const pageViewsBySurface: Record<string, number> = {
    marketing: 0,
    tenant: 0,
    admin: 0,
    unknown: 0,
  };
  for (const row of pageViews) {
    const dims = parseDims(row.summary);
    const s = (dims && (dims.surface as string)) || "unknown";
    if (pageViewsBySurface[s] == null) pageViewsBySurface[s] = 0;
    pageViewsBySurface[s] += 1;
  }
  const totalEvents = rows.reduce((acc, r) => acc + r._count._all, 0);
  return {
    totals: {
      events: totalEvents,
      pageViews: counts["page-view"] || 0,
      clicks: counts["element-clicked"] || 0,
      errors: counts["client-error"] || 0,
      fetchFails: counts["fetch-failed"] || 0,
      signups: counts["user-signed-up"] || 0,
    },
    pageViewsBySurface,
  };
}

export async function topPaths(
  args: {
    orgId?: string | null;
    surface?: string | null;
    since?: Date;
    until?: Date;
    limit?: number;
  } = {},
  prisma: PrismaClient = defaultPrisma,
): Promise<Array<{ path: string; count: number }>> {
  const limit = args.limit ?? 10;
  const where = analyticsWhere({ ...args, action: "analytics:page-view" });
  const rows = await prisma.auditLog.findMany({
    where: where as never,
    select: { summary: true },
  });
  const tally = new Map<string, number>();
  for (const row of rows) {
    const dims = parseDims(row.summary);
    if (!dims) continue;
    if (args.surface && dims.surface !== args.surface) continue;
    const path = (dims.path as string) || "(unknown)";
    tally.set(path, (tally.get(path) || 0) + 1);
  }
  return [...tally.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function topClicks(
  args: {
    orgId?: string | null;
    surface?: string | null;
    since?: Date;
    until?: Date;
    limit?: number;
  } = {},
  prisma: PrismaClient = defaultPrisma,
): Promise<Array<{ label: string; count: number }>> {
  const limit = args.limit ?? 10;
  const where = analyticsWhere({ ...args, action: "analytics:element-clicked" });
  const rows = await prisma.auditLog.findMany({
    where: where as never,
    select: { summary: true },
  });
  const tally = new Map<string, number>();
  for (const row of rows) {
    const dims = parseDims(row.summary);
    if (!dims || !dims.label) continue;
    if (args.surface && dims.surface !== args.surface) continue;
    tally.set(dims.label as string, (tally.get(dims.label as string) || 0) + 1);
  }
  return [...tally.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function recentErrors(
  args: { orgId?: string | null; since?: Date; limit?: number } = {},
  prisma: PrismaClient = defaultPrisma,
) {
  const limit = args.limit ?? 20;
  const where = analyticsWhere({ ...args, action: "analytics:client-error" });
  const rows = await prisma.auditLog.findMany({
    where: where as never,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, summary: true, createdAt: true, orgId: true },
  });
  return rows.map((r) => {
    const dims = (parseDims(r.summary) ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      createdAt: r.createdAt,
      orgId: r.orgId,
      message: (dims.message as string) || "(no message)",
      source: (dims.source as string) || "",
      line: (dims.line as number) || 0,
      col: (dims.col as number) || 0,
      surface: (dims.surface as string) || "unknown",
      path: (dims.path as string) || "",
      ua: (dims.ua as string) || "",
      kind: (dims.kind as string) || "error",
    };
  });
}

export async function recentFetchFails(
  args: { orgId?: string | null; since?: Date; limit?: number } = {},
  prisma: PrismaClient = defaultPrisma,
) {
  const limit = args.limit ?? 20;
  const where = analyticsWhere({ ...args, action: "analytics:fetch-failed" });
  const rows = await prisma.auditLog.findMany({
    where: where as never,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, summary: true, createdAt: true, orgId: true },
  });
  return rows.map((r) => {
    const dims = (parseDims(r.summary) ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      createdAt: r.createdAt,
      orgId: r.orgId,
      status: (dims.status as number) || 0,
      url: (dims.url as string) || "",
      surface: (dims.surface as string) || "unknown",
      path: (dims.path as string) || "",
    };
  });
}

export async function pageViewsByDay(
  args: { orgId?: string | null; since?: Date; until?: Date } = {},
  prisma: PrismaClient = defaultPrisma,
): Promise<Array<{ day: string; count: number }>> {
  const where = analyticsWhere({ ...args, action: "analytics:page-view" });
  const rows = await prisma.auditLog.findMany({
    where: where as never,
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const day = new Date(r.createdAt).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  return [...byDay.entries()].map(([day, count]) => ({ day, count }));
}

export async function topOrgs(
  args: { since?: Date; until?: Date; limit?: number } = {},
  prisma: PrismaClient = defaultPrisma,
) {
  const limit = args.limit ?? 10;
  const where = analyticsWhere(args);
  const rows = await prisma.auditLog.groupBy({
    by: ["orgId"],
    where: { ...(where as object), orgId: { not: null } } as never,
    _count: { _all: true },
    orderBy: { _count: { orgId: "desc" } },
    take: limit,
  });
  if (rows.length === 0) return [];
  const orgs = await prisma.org.findMany({
    where: { id: { in: rows.map((r) => r.orgId!) as string[] } },
    select: { id: true, slug: true, displayName: true, plan: true },
  });
  const byId = new Map(orgs.map((o) => [o.id, o]));
  return rows.map((r) => ({
    orgId: r.orgId,
    count: r._count._all,
    org: r.orgId ? byId.get(r.orgId) || null : null,
  }));
}

export async function marketingFunnel(
  args: { since?: Date; until?: Date } = {},
  prisma: PrismaClient = defaultPrisma,
) {
  const pvWhere = analyticsWhere({ ...args, action: "analytics:page-view" });
  const pageViews = await prisma.auditLog.findMany({
    where: pvWhere as never,
    select: { summary: true },
  });
  let marketingViews = 0;
  let signupViews = 0;
  for (const row of pageViews) {
    const dims = parseDims(row.summary);
    if (!dims) continue;
    if (dims.surface === "marketing") {
      marketingViews += 1;
      if (dims.path && /\/signup(?:\.html)?(?:[?#]|$)/.test(dims.path as string))
        signupViews += 1;
    }
  }

  const clickWhere = analyticsWhere({ ...args, action: "analytics:element-clicked" });
  const clicks = await prisma.auditLog.findMany({
    where: clickWhere as never,
    select: { summary: true },
  });
  let marketingClicks = 0;
  for (const row of clicks) {
    const dims = parseDims(row.summary);
    if (!dims) continue;
    if (dims.surface === "marketing" && dims.label) marketingClicks += 1;
  }

  const signupWhere = analyticsWhere({ ...args, action: "analytics:user-signed-up" });
  const signups = await prisma.auditLog.count({ where: signupWhere as never });

  const stage = (key: string, label: string, count: number, prevCount: number) => ({
    key,
    label,
    count,
    conversion: prevCount > 0 ? count / prevCount : null,
  });
  const stages = [
    stage("views", "Marketing page views", marketingViews, 0),
    stage("clicks", "CTA clicks", marketingClicks, marketingViews),
    stage("signup_view", "/signup page view", signupViews, marketingClicks),
    stage("signups", "Account signups", signups, signupViews),
  ];
  stages[0].conversion = null;
  return {
    stages,
    overall: marketingViews > 0 ? signups / marketingViews : null,
  };
}
