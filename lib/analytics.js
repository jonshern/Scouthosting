// Privacy-conscious analytics.
//
// Compass deals with minors' data, so we don't ship a third-party
// tracker, don't store IPs or user-agents, and don't follow users
// across the web. What we do measure is server-side, aggregated, and
// scoped to the org: page views, key conversions (signups, RSVPs,
// reimbursements approved, newsletters sent, two-deep suspensions).
//
// Each event is one AuditLog row of action="analytics:<event>", with
// `summary` carrying a tiny JSON payload of dimensions. We piggyback
// on AuditLog so retention + query story is unified — there's no
// separate table to forget about.

import { logger } from "./log.js";
import { prisma as defaultPrisma } from "./db.js";

const log = logger.child("analytics");

// Whitelist of event names. Adding to this list is intentional: every
// new event is a real measurement, not a "we'll figure out what to
// query later" wishlist.
export const EVENTS = Object.freeze({
  PAGE_VIEW: "page-view",
  // First-party client beacon. Surface dimension distinguishes
  // marketing / tenant / admin so the rollup can answer "what's
  // getting used in the admin app" without manual joins.
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
});

const EVENT_NAMES = new Set(Object.values(EVENTS));

/**
 * Record an analytics event. Best-effort: failures are logged but never
 * propagated, so a transient DB blip can't take a feature down for
 * measurement reasons.
 *
 * Dimensions should be small (label-cardinality, not high-uniqueness)
 * — orgId is fine; an arbitrary user comment string is not.
 */
export async function track(event, { orgId = null, userId = null, dimensions = {} } = {}, prisma = defaultPrisma) {
  if (!EVENT_NAMES.has(event)) {
    log.warn("unknown event name; ignored", { event });
    return;
  }
  try {
    await prisma.auditLog.create({
      data: {
        orgId,
        userId,
        userDisplay: null,
        entityType: "Analytics",
        entityId: null,
        action: `analytics:${event}`,
        summary: serialiseDimensions(dimensions),
      },
    });
  } catch (e) {
    log.warn("failed to record analytics event", { event, err: e });
  }
}

function serialiseDimensions(dims) {
  // Cap at 500 chars (matches AuditLog.summary truncation in lib/audit.js)
  // and round-trip through JSON so the column always parses back cleanly.
  try {
    const json = JSON.stringify(dims || {});
    return json.length > 500 ? json.slice(0, 497) + "..." : json;
  } catch {
    return null;
  }
}

/**
 * Roll up event counts over a time window. Returns an array of
 * { event, count } sorted descending. Used by the /admin/analytics
 * page to surface "what happened this week".
 */
export async function rollup({ orgId, since, until }, prisma = defaultPrisma) {
  const createdAt = until
    ? { gte: since, lte: until }
    : { gte: since };
  const rows = await prisma.auditLog.groupBy({
    by: ["action"],
    where: {
      orgId,
      action: { startsWith: "analytics:" },
      createdAt,
    },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({
      event: r.action.replace(/^analytics:/, ""),
      count: r._count._all,
    }))
    .sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------ */
/* Super-admin rollups                                                 */
/* ------------------------------------------------------------------ */
//
// These query across all orgs (no orgId filter) and parse the JSON
// `summary` column at read-time. For v1 traffic this is fine; once we
// outgrow it, the right move is a materialized view keyed off the
// dimensions we care about (surface, path, label, day).

const ANALYTICS_PREFIX = "analytics:";

/**
 * Headline summary: total events, page-views by surface, click count,
 * error count over a window.
 *
 * Returns:
 *   {
 *     totals: { events, pageViews, clicks, errors, fetchFails, signups },
 *     pageViewsBySurface: { marketing, tenant, admin, unknown }
 *   }
 */
export async function summarize({ since, until } = {}, prisma = defaultPrisma) {
  const where = analyticsWhere({ since, until });
  const rows = await prisma.auditLog.groupBy({
    by: ["action"],
    where,
    _count: { _all: true },
  });
  const counts = Object.fromEntries(
    rows.map((r) => [r.action.replace(/^analytics:/, ""), r._count._all]),
  );
  // For per-surface page-view breakdown we need the JSON dim, so a
  // second pass over the page-view rows. Bounded by the time window.
  const pageViews = await prisma.auditLog.findMany({
    where: { ...where, action: "analytics:page-view" },
    select: { summary: true },
  });
  const pageViewsBySurface = { marketing: 0, tenant: 0, admin: 0, unknown: 0 };
  for (const row of pageViews) {
    const dims = parseDims(row.summary);
    const s = (dims && dims.surface) || "unknown";
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

/**
 * Top paths by page-view count, scoped by surface (or all surfaces
 * when surface is null).
 */
export async function topPaths(
  { surface = null, since, until, limit = 10 } = {},
  prisma = defaultPrisma,
) {
  const where = analyticsWhere({ since, until, action: "analytics:page-view" });
  const rows = await prisma.auditLog.findMany({
    where,
    select: { summary: true },
  });
  const tally = new Map();
  for (const row of rows) {
    const dims = parseDims(row.summary);
    if (!dims) continue;
    if (surface && dims.surface !== surface) continue;
    const path = dims.path || "(unknown)";
    tally.set(path, (tally.get(path) || 0) + 1);
  }
  return [...tally.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Top click labels (data-track values) over a window, optionally
 * surface-scoped.
 */
export async function topClicks(
  { surface = null, since, until, limit = 10 } = {},
  prisma = defaultPrisma,
) {
  const where = analyticsWhere({ since, until, action: "analytics:element-clicked" });
  const rows = await prisma.auditLog.findMany({ where, select: { summary: true } });
  const tally = new Map();
  for (const row of rows) {
    const dims = parseDims(row.summary);
    if (!dims || !dims.label) continue;
    if (surface && dims.surface !== surface) continue;
    tally.set(dims.label, (tally.get(dims.label) || 0) + 1);
  }
  return [...tally.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Recent client-side error rows so the operator can see "what's
 * breaking right now".
 */
export async function recentErrors({ since, limit = 20 } = {}, prisma = defaultPrisma) {
  const where = analyticsWhere({ since, action: "analytics:client-error" });
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, summary: true, createdAt: true, orgId: true },
  });
  return rows.map((r) => {
    const dims = parseDims(r.summary) || {};
    return {
      id: r.id,
      createdAt: r.createdAt,
      orgId: r.orgId,
      message: dims.message || "(no message)",
      source: dims.source || "",
      line: dims.line || 0,
      col: dims.col || 0,
      surface: dims.surface || "unknown",
      path: dims.path || "",
      ua: dims.ua || "",
      kind: dims.kind || "error",
    };
  });
}

/**
 * Recent non-2xx fetches captured by the client beacon. Lets the
 * operator notice "the calendar is 500ing for everyone right now".
 */
export async function recentFetchFails({ since, limit = 20 } = {}, prisma = defaultPrisma) {
  const where = analyticsWhere({ since, action: "analytics:fetch-failed" });
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, summary: true, createdAt: true, orgId: true },
  });
  return rows.map((r) => {
    const dims = parseDims(r.summary) || {};
    return {
      id: r.id,
      createdAt: r.createdAt,
      orgId: r.orgId,
      status: dims.status || 0,
      url: dims.url || "",
      surface: dims.surface || "unknown",
      path: dims.path || "",
    };
  });
}

/**
 * Page views per day, bucketed by ISO date string (UTC). Used to draw
 * a sparkline on the dashboard.
 */
export async function pageViewsByDay({ since, until } = {}, prisma = defaultPrisma) {
  const where = analyticsWhere({ since, until, action: "analytics:page-view" });
  const rows = await prisma.auditLog.findMany({
    where,
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const byDay = new Map();
  for (const r of rows) {
    const day = new Date(r.createdAt).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  return [...byDay.entries()].map(([day, count]) => ({ day, count }));
}

/**
 * Top orgs by event volume in the window. Useful for "who's actually
 * using Compass" without joining a billing report.
 */
export async function topOrgs({ since, until, limit = 10 } = {}, prisma = defaultPrisma) {
  const where = analyticsWhere({ since, until });
  const rows = await prisma.auditLog.groupBy({
    by: ["orgId"],
    where: { ...where, orgId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { orgId: "desc" } },
    take: limit,
  });
  if (rows.length === 0) return [];
  const orgs = await prisma.org.findMany({
    where: { id: { in: rows.map((r) => r.orgId) } },
    select: { id: true, slug: true, displayName: true, plan: true },
  });
  const byId = new Map(orgs.map((o) => [o.id, o]));
  return rows.map((r) => ({
    orgId: r.orgId,
    count: r._count._all,
    org: byId.get(r.orgId) || null,
  }));
}

function analyticsWhere({ since, until, action } = {}) {
  const out = {};
  if (action) out.action = action;
  else out.action = { startsWith: ANALYTICS_PREFIX };
  if (since && until) out.createdAt = { gte: since, lte: until };
  else if (since) out.createdAt = { gte: since };
  else if (until) out.createdAt = { lte: until };
  return out;
}

function parseDims(summary) {
  if (!summary) return null;
  // Handle both clean JSON and the truncated "...}" case from
  // serialiseDimensions when the dimensions overflow 500 chars.
  try {
    return JSON.parse(summary);
  } catch {
    // Trailing-truncated JSON — try to repair by closing the open
    // braces. Best-effort; if it still fails return null.
    try {
      const trimmed = summary.replace(/\.\.\.$/, "");
      return JSON.parse(trimmed + (trimmed.endsWith("}") ? "" : '"}'));
    } catch {
      return null;
    }
  }
}
