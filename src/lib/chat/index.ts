// Group-chat core. Two responsibilities:
//
//   1. YPT (Youth Protection Training) two-deep enforcement.
//      Any channel that contains youth must have ≥2 YPT-current adult
//      leaders at all times. Every message write goes through the
//      guard; the nightly reconciler runs the same check across every
//      active channel as a backstop. A channel that fails the check
//      is auto-suspended (read-only) until the threshold is restored.
//
//   2. Channel auto-creation + membership reconciliation.
//      Patrol channels track Member.patrol; troop channels track
//      every org member; parents/leaders channels track their roles;
//      event channels link to a specific Event. Auto-managed members
//      carry addedAutomatically=true; manual owner adds carry false
//      so the reconciler doesn't undo a leader's deliberate override.
//
// Pure-functional with injectable prismaClient + clock so tests never
// touch a real DB.
//
// Identity model:
//   - A User is a "youth" if their OrgMembership.role === 'scout', or
//     they hold the default 'parent' role but their email matches a
//     youth (Member.isYouth) roster entry. See classifyMember().
//   - A User is an "adult leader" if role ∈ {leader, admin}. Parents
//     don't satisfy two-deep; only registered, YPT-current adults do.
//   - YPT-current means OrgMembership.yptCurrentUntil > now.
//   - A channel member with no OrgMembership in the channel's org is
//     treated as youth (unverified), never as an adult.
//   - DMs never include youth: findOrCreateDmChannel refuses them, so
//     there is no 1:1 adult-scout path.

import type { PrismaClient } from "@prisma/client";
import { audit } from "@/lib/audit";
import { publishSuspended, publishUnsuspended } from "@/lib/realtime/bus";

const HOUR_MS = 60 * 60 * 1000;
const EVENT_CHANNEL_GRACE_HOURS = 24;
const DM_REMINDER_DELAY_MS = 30 * 60 * 1000;

export const CHANNEL_KINDS = [
  "patrol",
  "troop",
  "parents",
  "leaders",
  "event",
  "custom",
  "dm",
] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

type Prisma = PrismaClient;

export type ActorContext = {
  org?: { id: string } | null;
  user?: { id: string; displayName?: string | null } | null;
};

/* ------------------------------------------------------------------ */
/* YPT guard                                                           */
/* ------------------------------------------------------------------ */

export type TwoDeepResult = {
  ok: boolean;
  hasYouth: boolean;
  currentAdultCount: number;
  reason: string | null;
};

/**
 * Who counts as youth. OrgMembership.role alone isn't enough: a scout
 * who signs up themselves gets the default "parent" role. So a
 * parent-role user whose email matches a youth roster entry is youth
 * too, and a channel member with no role in the org can't be confirmed
 * as an adult, so they count as youth (fail closed). Leaders and
 * admins are adults by role; they're the ones YPT applies to.
 */
export function classifyMember(
  membership: { role: string } | null | undefined,
  onYouthRoster: boolean,
): "youth" | "leader" | "adult" {
  if (!membership || membership.role === "scout") return "youth";
  if (membership.role === "leader" || membership.role === "admin") return "leader";
  return onYouthRoster ? "youth" : "adult";
}

async function rosterYouthEmails(
  orgId: string,
  emails: Array<string | null | undefined>,
  prismaClient: Prisma,
): Promise<Set<string>> {
  const wanted = [...new Set(emails.filter((e): e is string => !!e).map((e) => e.toLowerCase()))];
  if (!wanted.length) return new Set();
  const rows = await prismaClient.member.findMany({
    where: { orgId, isYouth: true, deletedAt: null, email: { in: wanted } },
    select: { email: true },
  });
  return new Set(rows.map((r) => (r.email ?? "").toLowerCase()));
}

/**
 * Cheap predicate: does this channel currently meet the two-deep bar?
 * Channel meets the bar iff (no youth) OR (≥2 YPT-current adults).
 */
export async function checkChannelTwoDeep(
  channelId: string,
  opts: { now?: Date; prismaClient: Prisma },
): Promise<TwoDeepResult> {
  if (!channelId) throw new Error("checkChannelTwoDeep: missing channelId");
  if (!opts?.prismaClient) throw new Error("checkChannelTwoDeep: missing prismaClient");
  const now = opts.now ?? new Date();
  const prismaClient = opts.prismaClient;

  const channel = await prismaClient.channel.findUnique({
    where: { id: channelId },
    select: { id: true, orgId: true, kind: true },
  });
  if (!channel) {
    return { ok: false, hasYouth: false, currentAdultCount: 0, reason: "channel-not-found" };
  }

  // No kind-based shortcut (e.g. "leaders"): owners can add people by
  // hand, so the actual member list is the only thing we trust.

  const members = await prismaClient.channelMember.findMany({
    where: { channelId },
    include: {
      user: {
        select: {
          email: true,
          memberships: {
            where: { orgId: channel.orgId },
            select: { role: true, yptCurrentUntil: true },
          },
        },
      },
    },
  });
  const youthEmails = await rosterYouthEmails(
    channel.orgId,
    members.map((cm) => cm.user.email),
    prismaClient,
  );

  let hasYouth = false;
  let currentAdultCount = 0;
  for (const cm of members) {
    const om = cm.user.memberships[0];
    const kind = classifyMember(om, youthEmails.has((cm.user.email ?? "").toLowerCase()));
    if (kind === "youth") {
      hasYouth = true;
    } else if (kind === "leader" && om?.yptCurrentUntil && new Date(om.yptCurrentUntil) > now) {
      currentAdultCount += 1;
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
 * Active enforcement: throws when below two-deep AND auto-suspends
 * the channel as a side effect. Callers on the write path use this.
 */
export async function assertChannelTwoDeep(
  channelId: string,
  opts: { now?: Date; prismaClient: Prisma } & ActorContext,
): Promise<TwoDeepResult> {
  const result = await checkChannelTwoDeep(channelId, opts);
  if (result.ok) return result;
  await suspendChannel(channelId, result.reason ?? "two-deep-failed", opts);
  const err = new Error(`Channel suspended: ${result.reason}`) as Error & {
    code?: string;
    reason?: string;
  };
  err.code = "CHANNEL_SUSPENDED";
  err.reason = result.reason ?? undefined;
  throw err;
}

export async function suspendChannel(
  channelId: string,
  reason: string,
  opts: { prismaClient: Prisma } & ActorContext,
): Promise<{ id: string; isSuspended: boolean; name: string; orgId: string } | null> {
  const { prismaClient, org, user } = opts;
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
    await prismaClient.message.create({
      data: {
        channelId,
        authorId: null,
        body: `🔒 This channel is paused while we re-establish two-deep leadership. New messages are off until a second YPT-current leader is added.`,
      },
    });
    if (org) {
      audit({
        orgId: org.id,
        userId: user?.id ?? null,
        userDisplay: user?.displayName ?? null,
        entityType: "Channel",
        entityId: channelId,
        action: "suspend",
        summary: `${before.name}: ${reason}`,
      });
    }
    try {
      publishSuspended(channelId, reason);
    } catch {
      // pub/sub failures never bubble up
    }
  }
  return before;
}

export async function unsuspendChannel(
  channelId: string,
  opts: { now?: Date; prismaClient: Prisma } & ActorContext,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { prismaClient, org, user } = opts;
  if (!prismaClient) throw new Error("unsuspendChannel: missing prismaClient");
  const before = await prismaClient.channel.findUnique({
    where: { id: channelId },
    select: { id: true, isSuspended: true, name: true },
  });
  if (!before || !before.isSuspended) return { ok: true };
  // A leader can't switch messages back on while the channel still
  // fails two-deep; the next post would just re-suspend it.
  const check = await checkChannelTwoDeep(channelId, { now: opts.now, prismaClient });
  if (!check.ok) return { ok: false, reason: check.reason ?? "two-deep-failed" };
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
    audit({
      orgId: org.id,
      userId: user?.id ?? null,
      userDisplay: user?.displayName ?? null,
      entityType: "Channel",
      entityId: channelId,
      action: "unsuspend",
      summary: before.name,
    });
  }
  try {
    publishUnsuspended(channelId);
  } catch {
    // pub/sub failures never bubble up
  }
  return { ok: true };
}

/**
 * Backstop for the write-path guard: re-check every live channel and
 * suspend any that have fallen below two-deep (an adult's YPT lapsed,
 * a leader left, a scout was added) even if nobody has posted since.
 * Called from the cron tick.
 */
export async function sweepChannelTwoDeep(opts: {
  now?: Date;
  prismaClient: Prisma;
}): Promise<{ checked: number; suspended: number }> {
  const { now = new Date(), prismaClient } = opts;
  const channels = await prismaClient.channel.findMany({
    where: { archivedAt: null, isSuspended: false },
    select: { id: true },
  });
  let suspended = 0;
  for (const c of channels) {
    const r = await checkChannelTwoDeep(c.id, { now, prismaClient });
    if (!r.ok && r.reason !== "channel-not-found") {
      await suspendChannel(c.id, r.reason ?? "two-deep-failed", { prismaClient });
      suspended += 1;
    }
  }
  return { checked: channels.length, suspended };
}

/* ------------------------------------------------------------------ */
/* Auto-creation                                                       */
/* ------------------------------------------------------------------ */

export async function ensureChannel(args: {
  orgId: string;
  kind: ChannelKind;
  name: string;
  patrolName?: string | null;
  eventId?: string | null;
  prismaClient: Prisma;
}): Promise<{ id: string }> {
  const { orgId, kind, name, patrolName = null, eventId = null, prismaClient } = args;
  if (!CHANNEL_KINDS.includes(kind)) throw new Error(`ensureChannel: unknown kind ${kind}`);
  if (!prismaClient) throw new Error("ensureChannel: missing prismaClient");

  const where: { orgId: string; kind: ChannelKind; patrolName?: string | null; eventId?: string | null } = {
    orgId,
    kind,
  };
  if (kind === "patrol") where.patrolName = patrolName;
  if (kind === "event") where.eventId = eventId;

  const existing = await prismaClient.channel.findFirst({ where });
  if (existing) return existing;
  return prismaClient.channel.create({
    data: { orgId, kind, name, patrolName, eventId },
  });
}

export async function reconcileChannelMembers(
  channelId: string,
  opts: { now?: Date; prismaClient: Prisma },
): Promise<{ added: number; removed: number; postSyncCheck: TwoDeepResult | null }> {
  const { now = new Date(), prismaClient } = opts;
  if (!prismaClient) throw new Error("reconcileChannelMembers: missing prismaClient");

  const channel = await prismaClient.channel.findUnique({
    where: { id: channelId },
    select: { id: true, orgId: true, kind: true, patrolName: true, eventId: true },
  });
  if (!channel) throw new Error(`reconcileChannelMembers: channel ${channelId} not found`);
  if (channel.kind === "custom") {
    return { added: 0, removed: 0, postSyncCheck: null };
  }

  const desired = await desiredUserIds(
    {
      orgId: channel.orgId,
      kind: channel.kind as ChannelKind,
      patrolName: channel.patrolName,
    },
    prismaClient,
  );
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
      data: toAdd.map((userId) => ({ channelId, userId, addedAutomatically: true })),
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
    await suspendChannel(channelId, postSyncCheck.reason ?? "two-deep-failed", { prismaClient });
  } else {
    // Auto-clear the suspension if reconciliation restored two-deep —
    // but bypass unsuspendChannel which fires audit; the audit trail
    // is for *leader-driven* unsuspend actions.
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

async function desiredUserIds(
  channel: { orgId: string; kind: ChannelKind; patrolName: string | null },
  prismaClient: Prisma,
): Promise<string[]> {
  const { orgId, kind, patrolName } = channel;
  if (kind === "leaders") {
    const rows = await prismaClient.orgMembership.findMany({
      where: { orgId, role: { in: ["leader", "admin"] } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
  if (kind === "parents") {
    const rows = await prismaClient.orgMembership.findMany({
      where: { orgId, role: { in: ["parent", "leader", "admin"] } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
  if (kind === "troop" || kind === "event") {
    const rows = await prismaClient.orgMembership.findMany({
      where: { orgId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
  if (kind === "patrol") {
    const [scoutMembers, leaders] = await Promise.all([
      prismaClient.member.findMany({
        where: { orgId, patrol: patrolName ?? undefined, email: { not: null } },
        select: { email: true },
      }),
      prismaClient.orgMembership.findMany({
        where: { orgId, role: { in: ["leader", "admin"] } },
        select: { userId: true },
      }),
    ]);
    const scoutEmails = scoutMembers.map((m) => m.email).filter((e): e is string => !!e);
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

export async function provisionStandingChannels(args: {
  org: { id: string; displayName: string };
  prismaClient: Prisma;
}): Promise<{ troop: { id: string }; parents: { id: string }; leaders: { id: string }; patrols: Array<{ id: string }> }> {
  const { org, prismaClient } = args;
  if (!org?.id) throw new Error("provisionStandingChannels: missing org");

  const troopName = `${org.displayName} — All members`;
  const troop = await ensureChannel({ orgId: org.id, kind: "troop", name: troopName, prismaClient });
  const parents = await ensureChannel({ orgId: org.id, kind: "parents", name: "Parents", prismaClient });
  const leaders = await ensureChannel({ orgId: org.id, kind: "leaders", name: "Leaders only", prismaClient });

  const patrols = await prismaClient.member.findMany({
    where: { orgId: org.id, patrol: { not: null } },
    distinct: ["patrol"],
    select: { patrol: true },
  });
  const patrolChannels: Array<{ id: string }> = [];
  for (const p of patrols) {
    if (!p.patrol) continue;
    const channel = await ensureChannel({
      orgId: org.id,
      kind: "patrol",
      name: `${p.patrol} patrol`,
      patrolName: p.patrol,
      prismaClient,
    });
    patrolChannels.push(channel);
  }

  for (const ch of [troop, parents, leaders, ...patrolChannels]) {
    await reconcileChannelMembers(ch.id, { prismaClient });
  }

  return { troop, parents, leaders, patrols: patrolChannels };
}

export async function provisionEventChannel(args: {
  event: { id: string; title: string };
  org: { id: string };
  prismaClient: Prisma;
}): Promise<{ id: string }> {
  const { event, org, prismaClient } = args;
  if (!event?.id || !org?.id) throw new Error("provisionEventChannel: missing event/org");
  const channel = await ensureChannel({
    orgId: org.id,
    kind: "event",
    name: event.title,
    eventId: event.id,
    prismaClient,
  });
  await reconcileChannelMembers(channel.id, { prismaClient });
  return channel;
}

export async function archiveEndedEventChannels(opts: {
  now?: Date;
  prismaClient: Prisma;
}): Promise<{ archived: number }> {
  const { now = new Date(), prismaClient } = opts;
  const threshold = new Date(now.getTime() - EVENT_CHANNEL_GRACE_HOURS * HOUR_MS);
  const candidates = await prismaClient.channel.findMany({
    where: { kind: "event", archivedAt: null, eventId: { not: null } },
    include: { event: { select: { endsAt: true, startsAt: true } } },
  });
  let archived = 0;
  for (const c of candidates) {
    if (!c.event) continue;
    const endTime = c.event.endsAt || c.event.startsAt;
    if (!endTime) continue;
    if (new Date(endTime) <= threshold) {
      await prismaClient.channel.update({ where: { id: c.id }, data: { archivedAt: now } });
      archived += 1;
    }
  }
  return { archived };
}

/* ------------------------------------------------------------------ */
/* Direct messages (kind="dm")                                         */
/* ------------------------------------------------------------------ */

function dmChannelName(userAId: string, userBId: string): string {
  return `dm:${[userAId, userBId].sort().join(":")}`;
}

export async function findOrCreateDmChannel(
  orgId: string,
  userAId: string,
  userBId: string,
  opts: { prismaClient: Prisma },
): Promise<{ id: string }> {
  if (!orgId || !userAId || !userBId || userAId === userBId) {
    throw new Error("findOrCreateDmChannel: needs orgId + two distinct user IDs");
  }
  const { prismaClient } = opts;
  if (!prismaClient) throw new Error("findOrCreateDmChannel: prismaClient required");

  // Youth protection: no private 1:1 channel may include a scout (or
  // anyone we can't confirm as an adult member of this org).
  const [memberships, users] = await Promise.all([
    prismaClient.orgMembership.findMany({
      where: { orgId, userId: { in: [userAId, userBId] } },
      select: { userId: true, role: true },
    }),
    prismaClient.user.findMany({
      where: { id: { in: [userAId, userBId] } },
      select: { id: true, email: true },
    }),
  ]);
  const youthEmails = await rosterYouthEmails(
    orgId,
    users.map((u) => u.email),
    prismaClient,
  );
  const membershipByUser = new Map(memberships.map((m) => [m.userId, m]));
  const emailByUser = new Map(users.map((u) => [u.id, (u.email ?? "").toLowerCase()]));
  for (const uid of [userAId, userBId]) {
    const kind = classifyMember(
      membershipByUser.get(uid),
      youthEmails.has(emailByUser.get(uid) ?? ""),
    );
    if (kind === "youth") {
      const err = new Error("Direct messages can't include youth members") as Error & {
        code?: string;
      };
      err.code = "DM_YOUTH_BLOCKED";
      throw err;
    }
  }

  const name = dmChannelName(userAId, userBId);
  const existing = await prismaClient.channel.findFirst({
    where: { orgId, kind: "dm", name },
  });
  if (existing) return existing;
  return prismaClient.channel.create({
    data: {
      orgId,
      kind: "dm",
      name,
      postPolicy: "members",
      members: {
        create: [
          { userId: userAId, addedAutomatically: false, role: "member" },
          { userId: userBId, addedAutomatically: false, role: "member" },
        ],
      },
    },
  });
}

/* ------------------------------------------------------------------ */
/* Email-reminder cron for unread DMs                                  */
/* ------------------------------------------------------------------ */

export async function findUnreadDmRemindersDue(opts: {
  now?: Date;
  prismaClient: Prisma;
}): Promise<Array<{ message: unknown; recipientUserId: string; channel: unknown }>> {
  const { now = new Date(), prismaClient } = opts;
  if (!prismaClient) throw new Error("findUnreadDmRemindersDue: prismaClient required");
  const cutoff = new Date(now.getTime() - DM_REMINDER_DELAY_MS);

  const candidates = await prismaClient.message.findMany({
    where: {
      emailReminderSentAt: null,
      createdAt: { lte: cutoff },
      deletedAt: null,
      channel: { kind: "dm" },
    },
    include: {
      author: { select: { id: true, displayName: true } },
      channel: {
        select: {
          id: true,
          orgId: true,
          org: { select: { slug: true, displayName: true } },
          members: { select: { userId: true, lastReadAt: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const out: Array<{ message: unknown; recipientUserId: string; channel: unknown }> = [];
  for (const m of candidates) {
    const others = m.channel.members.filter((cm) => cm.userId !== m.authorId);
    if (!others.length) continue;
    for (const cm of others) {
      if (cm.lastReadAt && cm.lastReadAt >= m.createdAt) continue;
      out.push({ message: m, recipientUserId: cm.userId, channel: m.channel });
    }
  }
  return out;
}

export async function markDmReminderSent(
  messageId: string,
  opts: { now?: Date; prismaClient: Prisma },
): Promise<void> {
  const { now = new Date(), prismaClient } = opts;
  if (!prismaClient) throw new Error("markDmReminderSent: prismaClient required");
  await prismaClient.message.update({
    where: { id: messageId },
    data: { emailReminderSentAt: now },
  });
}

export const _internal = {
  EVENT_CHANNEL_GRACE_HOURS,
  DM_REMINDER_DELAY_MS,
  dmChannelName,
  desiredUserIds,
};
