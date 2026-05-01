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
