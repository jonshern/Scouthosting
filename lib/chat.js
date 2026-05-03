// Group-chat core. Two responsibilities:
//
//   1. YPT (Youth Protection Training) two-deep enforcement.
//      Any channel that contains youth must have ≥2 YPT-current adult
//      leaders at all times. Every message write goes through the guard;
//      the nightly reconciler runs the same check across every active
//      channel as a backstop. A channel that fails the check is
//      auto-suspended (read-only) until the threshold is restored.
//
//   2. Channel auto-creation + membership reconciliation.
//      Patrol channels track Member.patrol; troop channels track every
//      org member; parents/leaders channels track their roles; event
//      channels link to a specific Event. Auto-managed members carry
//      addedAutomatically=true; manual owner adds carry false so
//      the reconciler doesn't undo a leader's deliberate override.
//
// Pure-functional with injectable prismaClient + clock so the tests
// never touch a real DB.
//
// Identity model:
//   - A User is a "youth" if their OrgMembership.role === 'scout'.
//   - A User is an "adult leader" if role ∈ {leader, admin}. Parents
//     don't satisfy two-deep; only registered, YPT-current adults do.
//   - YPT-current means OrgMembership.yptCurrentUntil > now.

import { recordAudit } from "./audit.js";
import { publishSuspended, publishUnsuspended } from "./realtime.js";

const HOUR_MS = 60 * 60 * 1000;
const EVENT_CHANNEL_GRACE_HOURS = 24;

const KIND_PATROL = "patrol";
const KIND_TROOP = "troop";
const KIND_PARENTS = "parents";
const KIND_LEADERS = "leaders";
const KIND_EVENT = "event";
const KIND_CUSTOM = "custom";

export const CHANNEL_KINDS = [
  KIND_PATROL,
  KIND_TROOP,
  KIND_PARENTS,
  KIND_LEADERS,
  KIND_EVENT,
  KIND_CUSTOM,
];

/* ------------------------------------------------------------------ */
/* YPT guard                                                           */
/* ------------------------------------------------------------------ */

/**
 * The cheap predicate we use everywhere: does this channel currently meet
 * the two-deep bar? A channel meets the bar if EITHER it contains no
 * youth, OR it contains ≥2 YPT-current adult leaders.
 *
 * Returns { ok, hasYouth, currentAdultCount, reason }.
 */
export async function checkChannelTwoDeep(channelId, { now = new Date(), prismaClient } = {}) {
  if (!channelId) throw new Error("checkChannelTwoDeep: missing channelId");
  if (!prismaClient) throw new Error("checkChannelTwoDeep: missing prismaClient");

  const channel = await prismaClient.channel.findUnique({
    where: { id: channelId },
    select: { id: true, orgId: true, kind: true },
  });
  if (!channel) {
    return { ok: false, hasYouth: false, currentAdultCount: 0, reason: "channel-not-found" };
  }

  // Leader-only and parent-only channels never contain youth and don't
  // need the guard (parents aren't youth either, but the channel-kind
  // is the source of truth — anyone manually added is on the leader who
  // did it). Custom channels always run the guard.
  if (channel.kind === KIND_LEADERS) {
    return { ok: true, hasYouth: false, currentAdultCount: 0, reason: null };
  }

  // Pull every membership joined to its OrgMembership row in this org.
  // We deliberately scope the OrgMembership by orgId — a user with many
  // org memberships still has the right yptCurrentUntil per-org.
  const members = await prismaClient.channelMember.findMany({
    where: { channelId },
    include: {
      user: {
        select: {
          memberships: {
            where: { orgId: channel.orgId },
            select: { role: true, yptCurrentUntil: true },
          },
        },
      },
    },
  });

  let hasYouth = false;
  let currentAdultCount = 0;
  for (const cm of members) {
    const om = cm.user.memberships[0];
    if (!om) continue; // orphaned channel-member; ignore for the count
    if (om.role === "scout") {
      hasYouth = true;
    } else if (om.role === "leader" || om.role === "admin") {
      if (om.yptCurrentUntil && new Date(om.yptCurrentUntil) > now) {
        currentAdultCount += 1;
      }
    }
  }

  if (!hasYouth) {
    return { ok: true, hasYouth: false, currentAdultCount, reason: null };
  }
  if (currentAdultCount >= 2) {
    return { ok: true, hasYouth: true, currentAdultCount, reason: null };
  }
  return {
    ok: false,
    hasYouth: true,
    currentAdultCount,
    reason: currentAdultCount === 0 ? "no-current-adults" : "only-one-current-adult",
  };
}

/**
 * The active enforcement variant: throws if the channel doesn't meet the
 * two-deep bar AND auto-suspends it as a side effect. Call this from the
 * write path (POST /messages, POST /reactions, etc.).
 *
 * Returns the channel row (refetched after potential suspension) so the
 * caller can decide whether to continue.
 */
export async function assertChannelTwoDeep(channelId, { now = new Date(), prismaClient, org, user } = {}) {
  const result = await checkChannelTwoDeep(channelId, { now, prismaClient });
  if (result.ok) {
    return { ok: true, ...result };
  }
  // Suspend.
  await suspendChannel(channelId, result.reason, { prismaClient, org, user });
  const err = new Error(`Channel suspended: ${result.reason}`);
  err.code = "CHANNEL_SUSPENDED";
  err.reason = result.reason;
  throw err;
}

/**
 * Mark a channel as suspended. Idempotent — if it's already suspended we
 * just refresh the reason and skip the audit-log spam.
 */
export async function suspendChannel(channelId, reason, { prismaClient, org, user } = {}) {
  if (!prismaClient) throw new Error("suspendChannel: missing prismaClient");
  const before = await prismaClient.channel.findUnique({
    where: { id: channelId },
    select: { id: true, isSuspended: true, name: true, orgId: true },
  });
  if (!before) return null;
  await prismaClient.channel.update({
    where: { id: channelId },
    data: { isSuspended: true, suspendedReason: reason },
  });
  if (!before.isSuspended) {
    // Drop a system message into the channel so members see *why* posts
    // stopped working. Author null = system message; the renderer can
    // style this distinctly.
    await prismaClient.message.create({
      data: {
        channelId,
        authorId: null,
        body: `🔒 This channel is paused while we re-establish two-deep leadership. New messages are off until a second YPT-current leader is added.`,
      },
    });
    if (org) {
      await recordAudit({
        org,
        user,
        entityType: "Channel",
        entityId: channelId,
        action: "suspend",
        summary: `${before.name}: ${reason}`,
        prismaClient,
      });
    }
    // Best-effort fan-out so any open SSE subscriber sees the state
    // change in real time.
    try {
      publishSuspended(channelId, reason);
    } catch {
      // pub/sub failures never bubble up to the caller
    }
  }
  return before;
}

/** Lift the suspension. Pairs with reconcileChannelMembers when a new YPT-current adult is added. */
export async function unsuspendChannel(channelId, { prismaClient, org, user } = {}) {
  if (!prismaClient) throw new Error("unsuspendChannel: missing prismaClient");
  const before = await prismaClient.channel.findUnique({
    where: { id: channelId },
    select: { id: true, isSuspended: true, name: true },
  });
  if (!before || !before.isSuspended) return;
  await prismaClient.channel.update({
    where: { id: channelId },
    data: { isSuspended: false, suspendedReason: null },
  });
  await prismaClient.message.create({
    data: {
      channelId,
      authorId: null,
      body: `✅ Two-deep restored. Messages are back on.`,
    },
  });
  if (org) {
    await recordAudit({
      org,
      user,
      entityType: "Channel",
      entityId: channelId,
      action: "unsuspend",
      summary: before.name,
      prismaClient,
    });
  }
  try {
    publishUnsuspended(channelId);
  } catch {
    // pub/sub failures never bubble up to the caller
  }
}

/* ------------------------------------------------------------------ */
/* Auto-creation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Idempotent helper. If a channel of the given (orgId, kind, key) shape
 * already exists, return it. Otherwise create it. `key` differentiates
 * patrol channels (patrolName) and event channels (eventId) within the
 * same org.
 */
export async function ensureChannel({
  orgId,
  kind,
  name,
  patrolName = null,
  eventId = null,
  prismaClient,
} = {}) {
  if (!CHANNEL_KINDS.includes(kind)) throw new Error(`ensureChannel: unknown kind ${kind}`);
  if (!prismaClient) throw new Error("ensureChannel: missing prismaClient");

  const where = { orgId, kind };
  if (kind === KIND_PATROL) where.patrolName = patrolName;
  if (kind === KIND_EVENT) where.eventId = eventId;

  let channel = await prismaClient.channel.findFirst({ where });
  if (channel) return channel;
  channel = await prismaClient.channel.create({
    data: { orgId, kind, name, patrolName, eventId },
  });
  return channel;
}

/**
 * Sync a channel's auto-managed memberships against the current org
 * roster. Doesn't touch members where addedAutomatically=false (leader
 * overrides). After the sync we run the YPT guard and suspend if needed.
 *
 * Membership rules per kind:
 *   patrol  — every User whose OrgMembership has role=scout AND every
 *             Member.patrol matching this channel's patrolName
 *             (a User is "in patrol X" if they have a Member row in this
 *             org with that patrol; we resolve User via Member.email →
 *             User.email, since Members aren't always Users.)
 *             PLUS every leader/admin in the org. The reconciler adds
 *             every leader; the guard refuses to unsuspend until ≥2 are
 *             YPT-current.
 *   troop   — every User with any OrgMembership in this org.
 *   parents — every User with role ∈ {parent, leader, admin}.
 *   leaders — every User with role ∈ {leader, admin}.
 *   event   — same membership as troop (every member of the org). Once
 *             the event ends + the grace period passes, the channel is
 *             archived rather than suspended.
 *   custom  — manual only; this function is a no-op for custom channels.
 *
 * Returns { added, removed, postSyncCheck }.
 */
export async function reconcileChannelMembers(
  channelId,
  { now = new Date(), prismaClient } = {},
) {
  if (!prismaClient) throw new Error("reconcileChannelMembers: missing prismaClient");

  const channel = await prismaClient.channel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      orgId: true,
      kind: true,
      patrolName: true,
      eventId: true,
    },
  });
  if (!channel) throw new Error(`reconcileChannelMembers: channel ${channelId} not found`);
  if (channel.kind === KIND_CUSTOM) {
    return { added: 0, removed: 0, postSyncCheck: null };
  }

  const desired = await desiredUserIds(channel, prismaClient);
  const existing = await prismaClient.channelMember.findMany({
    where: { channelId },
    select: { userId: true, addedAutomatically: true },
  });
  const existingSet = new Set(existing.map((e) => e.userId));
  const desiredSet = new Set(desired);

  const toAdd = desired.filter((uid) => !existingSet.has(uid));
  const toRemove = existing
    .filter((e) => e.addedAutomatically && !desiredSet.has(e.userId))
    .map((e) => e.userId);

  if (toAdd.length) {
    await prismaClient.channelMember.createMany({
      data: toAdd.map((userId) => ({
        channelId,
        userId,
        addedAutomatically: true,
      })),
      skipDuplicates: true,
    });
  }
  if (toRemove.length) {
    await prismaClient.channelMember.deleteMany({
      where: {
        channelId,
        userId: { in: toRemove },
        addedAutomatically: true,
      },
    });
  }

  const postSyncCheck = await checkChannelTwoDeep(channelId, { now, prismaClient });
  if (!postSyncCheck.ok) {
    await suspendChannel(channelId, postSyncCheck.reason, { prismaClient });
  } else {
    // Auto-clear the suspension if reconciliation restored two-deep —
    // but only the system, not via unsuspendChannel which fires audit.
    // The audit audit-trail is for *leader-driven* unsuspend actions.
    const c = await prismaClient.channel.findUnique({
      where: { id: channelId },
      select: { isSuspended: true },
    });
    if (c?.isSuspended) {
      await prismaClient.channel.update({
        where: { id: channelId },
        data: { isSuspended: false, suspendedReason: null },
      });
    }
  }

  return { added: toAdd.length, removed: toRemove.length, postSyncCheck };
}

async function desiredUserIds(channel, prismaClient) {
  const { orgId, kind, patrolName } = channel;
  if (kind === KIND_LEADERS) {
    const rows = await prismaClient.orgMembership.findMany({
      where: { orgId, role: { in: ["leader", "admin"] } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
  if (kind === KIND_PARENTS) {
    const rows = await prismaClient.orgMembership.findMany({
      where: { orgId, role: { in: ["parent", "leader", "admin"] } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
  if (kind === KIND_TROOP || kind === KIND_EVENT) {
    const rows = await prismaClient.orgMembership.findMany({
      where: { orgId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
  if (kind === KIND_PATROL) {
    // Scouts whose Member.patrol matches + every leader/admin.
    const [scoutMembers, leaders] = await Promise.all([
      prismaClient.member.findMany({
        where: { orgId, patrol: patrolName, email: { not: null } },
        select: { email: true },
      }),
      prismaClient.orgMembership.findMany({
        where: { orgId, role: { in: ["leader", "admin"] } },
        select: { userId: true },
      }),
    ]);
    const scoutEmails = scoutMembers.map((m) => m.email).filter(Boolean);
    const scoutUsers = scoutEmails.length
      ? await prismaClient.user.findMany({
          where: { email: { in: scoutEmails } },
          select: { id: true },
        })
      : [];
    return [...scoutUsers.map((u) => u.id), ...leaders.map((l) => l.userId)];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Org-level provisioning                                              */
/* ------------------------------------------------------------------ */

/**
 * Make sure the four standing channels exist for an org: troop, parents,
 * leaders, plus one patrol channel per distinct Member.patrol value.
 * Idempotent — call after any roster change to keep things in sync.
 */
export async function provisionStandingChannels({ org, prismaClient }) {
  if (!org?.id) throw new Error("provisionStandingChannels: missing org");

  const troopName = `${org.displayName} — All members`;
  const troop = await ensureChannel({
    orgId: org.id, kind: KIND_TROOP, name: troopName, prismaClient,
  });
  const parents = await ensureChannel({
    orgId: org.id, kind: KIND_PARENTS, name: "Parents", prismaClient,
  });
  const leaders = await ensureChannel({
    orgId: org.id, kind: KIND_LEADERS, name: "Leaders only", prismaClient,
  });

  const patrols = await prismaClient.member.findMany({
    where: { orgId: org.id, patrol: { not: null } },
    distinct: ["patrol"],
    select: { patrol: true },
  });
  const patrolChannels = [];
  for (const p of patrols) {
    if (!p.patrol) continue;
    const channel = await ensureChannel({
      orgId: org.id,
      kind: KIND_PATROL,
      name: `${p.patrol} patrol`,
      patrolName: p.patrol,
      prismaClient,
    });
    patrolChannels.push(channel);
  }

  // Reconcile every standing channel so memberships catch up to the
  // current roster.
  for (const ch of [troop, parents, leaders, ...patrolChannels]) {
    await reconcileChannelMembers(ch.id, { prismaClient });
  }

  return { troop, parents, leaders, patrols: patrolChannels };
}

/**
 * Ensure an event has its own channel and that its membership matches
 * the current roster. Call when an event is published, or as part of the
 * nightly reconciler.
 */
export async function provisionEventChannel({ event, org, prismaClient }) {
  if (!event?.id || !org?.id) throw new Error("provisionEventChannel: missing event/org");
  const channel = await ensureChannel({
    orgId: org.id,
    kind: KIND_EVENT,
    name: event.title,
    eventId: event.id,
    prismaClient,
  });
  await reconcileChannelMembers(channel.id, { prismaClient });
  return channel;
}

/**
 * Archive an event channel that ended more than EVENT_CHANNEL_GRACE_HOURS
 * ago. Idempotent. Archived channels are read-only on the public API.
 */
export async function archiveEndedEventChannels({ now = new Date(), prismaClient } = {}) {
  const threshold = new Date(now.getTime() - EVENT_CHANNEL_GRACE_HOURS * HOUR_MS);
  const candidates = await prismaClient.channel.findMany({
    where: {
      kind: KIND_EVENT,
      archivedAt: null,
      eventId: { not: null },
    },
    include: { event: { select: { endsAt: true, startsAt: true } } },
  });
  let archived = 0;
  for (const c of candidates) {
    if (!c.event) continue;
    const endTime = c.event.endsAt || c.event.startsAt;
    if (!endTime) continue;
    if (new Date(endTime) <= threshold) {
      await prismaClient.channel.update({
        where: { id: c.id },
        data: { archivedAt: now },
      });
      archived += 1;
    }
  }
  return { archived };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const _internal = {
  KIND_PATROL,
  KIND_TROOP,
  KIND_PARENTS,
  KIND_LEADERS,
  KIND_EVENT,
  KIND_CUSTOM,
  EVENT_CHANNEL_GRACE_HOURS,
  desiredUserIds,
};
