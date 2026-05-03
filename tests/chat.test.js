// Group-chat tests. The YPT (Youth Protection Training) two-deep guard is
// the youth-safety feature here, so we're paranoid about coverage. Every
// branch of checkChannelTwoDeep gets a test, suspension is verified to
// be idempotent + auditable, and the reconciler is checked against the
// "auto-managed vs. manual override" line.

import { describe, it, expect, beforeEach } from "vitest";
import {
  checkChannelTwoDeep,
  assertChannelTwoDeep,
  suspendChannel,
  unsuspendChannel,
  ensureChannel,
  reconcileChannelMembers,
  provisionStandingChannels,
  provisionEventChannel,
  archiveEndedEventChannels,
  CHANNEL_KINDS,
  _internal,
} from "../lib/chat.js";

const NOW = new Date("2026-04-30T12:00:00Z");
const ORG = { id: "org1", displayName: "Test Troop", slug: "testtroop" };
const FUTURE = new Date("2026-12-31T00:00:00Z");
const PAST = new Date("2025-01-01T00:00:00Z");

/**
 * Build an in-memory Prisma double with just the surface chat.js needs.
 * Each "table" is an array; the methods filter / mutate it the same way
 * the real Prisma adapter would. Imperfect mirror of Prisma's API — only
 * the fields chat.js actually exercises are honored.
 */
function fakePrisma(seed = {}) {
  const channels = (seed.channels || []).map((c) => ({ ...c }));
  const channelMembers = (seed.channelMembers || []).map((c) => ({ ...c }));
  const messages = [...(seed.messages || [])];
  const orgMemberships = (seed.orgMemberships || []).map((m) => ({ ...m }));
  const users = (seed.users || []).map((u) => ({ ...u }));
  const members = (seed.members || []).map((m) => ({ ...m }));
  const auditLogs = [];

  let cuid = 0;
  const id = () => `id${++cuid}`;

  function matchAll(rows, filter) {
    if (!filter) return rows;
    return rows.filter((r) => Object.entries(filter).every(([k, v]) => {
      if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
        if ("in" in v) return v.in.includes(r[k]);
        if ("not" in v) return r[k] !== v.not;
        if ("gt" in v) return r[k] > v.gt;
        if ("lt" in v) return r[k] < v.lt;
        if ("lte" in v) return r[k] <= v.lte;
        if ("gte" in v) return r[k] >= v.gte;
      }
      return r[k] === v;
    }));
  }

  return {
    channel: {
      async findUnique({ where, select, include }) {
        const ch = channels.find((c) => c.id === where.id);
        if (!ch) return null;
        return select ? Object.fromEntries(Object.entries(select).filter(([, v]) => v).map(([k]) => [k, ch[k]])) : ch;
      },
      async findFirst({ where }) {
        return channels.find((c) => Object.entries(where).every(([k, v]) => c[k] === v)) || null;
      },
      async findMany({ where, include }) {
        let rows = matchAll(channels, where);
        if (include?.event) {
          rows = rows.map((r) => ({
            ...r,
            event: r.eventId ? (seed.events || []).find((e) => e.id === r.eventId) : null,
          }));
        }
        return rows;
      },
      async create({ data }) {
        const row = {
          id: id(),
          isSuspended: false,
          suspendedReason: null,
          archivedAt: null,
          patrolName: null,
          eventId: null,
          createdAt: NOW,
          updatedAt: NOW,
          ...data,
        };
        channels.push(row);
        return row;
      },
      async update({ where, data }) {
        const ch = channels.find((c) => c.id === where.id);
        if (!ch) return null;
        Object.assign(ch, data);
        return ch;
      },
    },
    channelMember: {
      async findMany({ where, select, include }) {
        let rows = matchAll(channelMembers, where);
        if (include?.user) {
          rows = rows.map((cm) => ({
            ...cm,
            user: {
              memberships: orgMemberships
                .filter((om) => om.userId === cm.userId && (!include.user.select?.memberships?.where?.orgId || om.orgId === include.user.select.memberships.where.orgId))
                .map((om) => ({ role: om.role, yptCurrentUntil: om.yptCurrentUntil })),
            },
          }));
        }
        return rows;
      },
      async createMany({ data, skipDuplicates }) {
        for (const d of data) {
          const exists = channelMembers.some((cm) => cm.channelId === d.channelId && cm.userId === d.userId);
          if (exists && skipDuplicates) continue;
          channelMembers.push({
            id: id(),
            role: "member",
            joinedAt: NOW,
            mutedUntil: null,
            addedAutomatically: true,
            ...d,
          });
        }
        return { count: data.length };
      },
      async deleteMany({ where }) {
        const before = channelMembers.length;
        for (let i = channelMembers.length - 1; i >= 0; i--) {
          const cm = channelMembers[i];
          let match = true;
          if (where.channelId && cm.channelId !== where.channelId) match = false;
          if (where.userId?.in && !where.userId.in.includes(cm.userId)) match = false;
          if (where.addedAutomatically !== undefined && cm.addedAutomatically !== where.addedAutomatically) match = false;
          if (match) channelMembers.splice(i, 1);
        }
        return { count: before - channelMembers.length };
      },
    },
    message: {
      async create({ data }) {
        const row = { id: id(), createdAt: NOW, ...data };
        messages.push(row);
        return row;
      },
    },
    orgMembership: {
      async findMany({ where, select }) {
        return matchAll(orgMemberships, where);
      },
    },
    member: {
      async findMany({ where, distinct, select }) {
        let rows = matchAll(members, where);
        if (distinct?.includes("patrol")) {
          const seen = new Set();
          rows = rows.filter((m) => {
            if (seen.has(m.patrol)) return false;
            seen.add(m.patrol);
            return true;
          });
        }
        return rows;
      },
    },
    user: {
      async findMany({ where }) {
        return matchAll(users, where);
      },
    },
    auditLog: {
      async create({ data }) {
        auditLogs.push(data);
        return data;
      },
    },
    _state: { channels, channelMembers, messages, orgMemberships, users, members, auditLogs },
  };
}

/* ------------------------------------------------------------------ */
/* checkChannelTwoDeep                                                 */
/* ------------------------------------------------------------------ */

describe("checkChannelTwoDeep", () => {
  it("returns ok for a leaders-only channel regardless of membership", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "leaders" }],
    });
    const r = await checkChannelTwoDeep("ch", { now: NOW, prismaClient: prisma });
    expect(r.ok).toBe(true);
    expect(r.hasYouth).toBe(false);
  });

  it("returns ok for any channel that contains no youth", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "parents" }],
      channelMembers: [
        { channelId: "ch", userId: "u-parent" },
      ],
      orgMemberships: [
        { userId: "u-parent", orgId: "org1", role: "parent", yptCurrentUntil: null },
      ],
    });
    const r = await checkChannelTwoDeep("ch", { now: NOW, prismaClient: prisma });
    expect(r.ok).toBe(true);
    expect(r.hasYouth).toBe(false);
  });

  it("blocks a youth channel with zero current adults", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "patrol" }],
      channelMembers: [
        { channelId: "ch", userId: "u-scout" },
      ],
      orgMemberships: [
        { userId: "u-scout", orgId: "org1", role: "scout", yptCurrentUntil: null },
      ],
    });
    const r = await checkChannelTwoDeep("ch", { now: NOW, prismaClient: prisma });
    expect(r.ok).toBe(false);
    expect(r.hasYouth).toBe(true);
    expect(r.currentAdultCount).toBe(0);
    expect(r.reason).toBe("no-current-adults");
  });

  it("blocks a youth channel with only one current adult", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "patrol" }],
      channelMembers: [
        { channelId: "ch", userId: "u-scout" },
        { channelId: "ch", userId: "u-leader1" },
      ],
      orgMemberships: [
        { userId: "u-scout", orgId: "org1", role: "scout", yptCurrentUntil: null },
        { userId: "u-leader1", orgId: "org1", role: "leader", yptCurrentUntil: FUTURE },
      ],
    });
    const r = await checkChannelTwoDeep("ch", { now: NOW, prismaClient: prisma });
    expect(r.ok).toBe(false);
    expect(r.currentAdultCount).toBe(1);
    expect(r.reason).toBe("only-one-current-adult");
  });

  it("permits a youth channel with two current adults", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "patrol" }],
      channelMembers: [
        { channelId: "ch", userId: "u-scout" },
        { channelId: "ch", userId: "u-leader1" },
        { channelId: "ch", userId: "u-leader2" },
      ],
      orgMemberships: [
        { userId: "u-scout", orgId: "org1", role: "scout", yptCurrentUntil: null },
        { userId: "u-leader1", orgId: "org1", role: "leader", yptCurrentUntil: FUTURE },
        { userId: "u-leader2", orgId: "org1", role: "admin", yptCurrentUntil: FUTURE },
      ],
    });
    const r = await checkChannelTwoDeep("ch", { now: NOW, prismaClient: prisma });
    expect(r.ok).toBe(true);
    expect(r.currentAdultCount).toBe(2);
  });

  it("blocks when a leader's YPT has expired (treats them as not-current)", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "patrol" }],
      channelMembers: [
        { channelId: "ch", userId: "u-scout" },
        { channelId: "ch", userId: "u-current" },
        { channelId: "ch", userId: "u-expired" },
      ],
      orgMemberships: [
        { userId: "u-scout", orgId: "org1", role: "scout", yptCurrentUntil: null },
        { userId: "u-current", orgId: "org1", role: "leader", yptCurrentUntil: FUTURE },
        { userId: "u-expired", orgId: "org1", role: "leader", yptCurrentUntil: PAST },
      ],
    });
    const r = await checkChannelTwoDeep("ch", { now: NOW, prismaClient: prisma });
    expect(r.ok).toBe(false);
    expect(r.currentAdultCount).toBe(1);
  });

  it("treats parents as non-adult-leaders for the count (parents never satisfy two-deep)", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "patrol" }],
      channelMembers: [
        { channelId: "ch", userId: "u-scout" },
        { channelId: "ch", userId: "u-parent1" },
        { channelId: "ch", userId: "u-parent2" },
      ],
      orgMemberships: [
        { userId: "u-scout", orgId: "org1", role: "scout", yptCurrentUntil: null },
        { userId: "u-parent1", orgId: "org1", role: "parent", yptCurrentUntil: FUTURE },
        { userId: "u-parent2", orgId: "org1", role: "parent", yptCurrentUntil: FUTURE },
      ],
    });
    const r = await checkChannelTwoDeep("ch", { now: NOW, prismaClient: prisma });
    expect(r.ok).toBe(false);
    expect(r.currentAdultCount).toBe(0);
  });

  it("returns false when the channel doesn't exist", async () => {
    const prisma = fakePrisma();
    const r = await checkChannelTwoDeep("nope", { now: NOW, prismaClient: prisma });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("channel-not-found");
  });

  it("requires channelId + prismaClient", async () => {
    await expect(checkChannelTwoDeep()).rejects.toThrow(/missing channelId/);
    await expect(checkChannelTwoDeep("x")).rejects.toThrow(/missing prismaClient/);
  });
});

/* ------------------------------------------------------------------ */
/* assertChannelTwoDeep + suspension                                    */
/* ------------------------------------------------------------------ */

describe("assertChannelTwoDeep", () => {
  it("returns ok and does NOT suspend a healthy channel", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "patrol", isSuspended: false }],
      channelMembers: [
        { channelId: "ch", userId: "u-scout" },
        { channelId: "ch", userId: "u-l1" },
        { channelId: "ch", userId: "u-l2" },
      ],
      orgMemberships: [
        { userId: "u-scout", orgId: "org1", role: "scout" },
        { userId: "u-l1", orgId: "org1", role: "leader", yptCurrentUntil: FUTURE },
        { userId: "u-l2", orgId: "org1", role: "leader", yptCurrentUntil: FUTURE },
      ],
    });
    const r = await assertChannelTwoDeep("ch", { now: NOW, prismaClient: prisma });
    expect(r.ok).toBe(true);
    expect(prisma._state.channels[0].isSuspended).toBe(false);
  });

  it("throws CHANNEL_SUSPENDED and suspends an unhealthy youth channel", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "patrol", isSuspended: false, name: "Eagle patrol" }],
      channelMembers: [
        { channelId: "ch", userId: "u-scout" },
      ],
      orgMemberships: [
        { userId: "u-scout", orgId: "org1", role: "scout" },
      ],
    });
    await expect(
      assertChannelTwoDeep("ch", { now: NOW, prismaClient: prisma, org: ORG }),
    ).rejects.toMatchObject({ code: "CHANNEL_SUSPENDED" });
    expect(prisma._state.channels[0].isSuspended).toBe(true);
    expect(prisma._state.channels[0].suspendedReason).toBe("no-current-adults");
    // System message dropped into the channel.
    expect(prisma._state.messages).toHaveLength(1);
    expect(prisma._state.messages[0].body).toMatch(/paused/i);
    expect(prisma._state.messages[0].authorId).toBeNull();
    // Audit-logged once.
    expect(prisma._state.auditLogs).toHaveLength(1);
    expect(prisma._state.auditLogs[0].action).toBe("suspend");
  });

  it("suspendChannel is idempotent — second call doesn't double-audit", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "patrol", isSuspended: false, name: "Eagle" }],
    });
    await suspendChannel("ch", "no-current-adults", { prismaClient: prisma, org: ORG });
    await suspendChannel("ch", "no-current-adults", { prismaClient: prisma, org: ORG });
    expect(prisma._state.channels[0].isSuspended).toBe(true);
    expect(prisma._state.auditLogs).toHaveLength(1);
    expect(prisma._state.messages).toHaveLength(1);
  });

  it("unsuspendChannel only acts on currently-suspended channels", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "patrol", isSuspended: false, name: "Eagle" }],
    });
    await unsuspendChannel("ch", { prismaClient: prisma, org: ORG });
    expect(prisma._state.messages).toHaveLength(0);
    expect(prisma._state.auditLogs).toHaveLength(0);
  });

  it("unsuspendChannel posts the all-clear and audit-logs", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "patrol", isSuspended: true, suspendedReason: "no-current-adults", name: "Eagle" }],
    });
    await unsuspendChannel("ch", { prismaClient: prisma, org: ORG });
    expect(prisma._state.channels[0].isSuspended).toBe(false);
    expect(prisma._state.channels[0].suspendedReason).toBeNull();
    expect(prisma._state.messages).toHaveLength(1);
    expect(prisma._state.messages[0].body).toMatch(/restored/i);
    expect(prisma._state.auditLogs[0].action).toBe("unsuspend");
  });
});

/* ------------------------------------------------------------------ */
/* ensureChannel + reconcile                                           */
/* ------------------------------------------------------------------ */

describe("ensureChannel", () => {
  it("creates a new channel when none exists", async () => {
    const prisma = fakePrisma();
    const ch = await ensureChannel({
      orgId: "org1",
      kind: "leaders",
      name: "Leaders only",
      prismaClient: prisma,
    });
    expect(ch.kind).toBe("leaders");
    expect(prisma._state.channels).toHaveLength(1);
  });

  it("returns the existing patrol channel rather than creating a duplicate", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "existing", orgId: "org1", kind: "patrol", patrolName: "Eagle", name: "Eagle patrol" }],
    });
    const ch = await ensureChannel({
      orgId: "org1",
      kind: "patrol",
      patrolName: "Eagle",
      name: "Eagle patrol",
      prismaClient: prisma,
    });
    expect(ch.id).toBe("existing");
    expect(prisma._state.channels).toHaveLength(1);
  });

  it("rejects unknown kinds", async () => {
    const prisma = fakePrisma();
    await expect(
      ensureChannel({ orgId: "org1", kind: "wat", name: "x", prismaClient: prisma }),
    ).rejects.toThrow(/unknown kind/);
  });
});

describe("reconcileChannelMembers", () => {
  it("adds every leader/admin to a leaders-only channel", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "leaders" }],
      orgMemberships: [
        { userId: "u-leader", orgId: "org1", role: "leader", yptCurrentUntil: FUTURE },
        { userId: "u-admin", orgId: "org1", role: "admin", yptCurrentUntil: FUTURE },
        { userId: "u-parent", orgId: "org1", role: "parent" },
      ],
    });
    const r = await reconcileChannelMembers("ch", { now: NOW, prismaClient: prisma });
    expect(r.added).toBe(2);
    const ids = prisma._state.channelMembers.filter((cm) => cm.channelId === "ch").map((cm) => cm.userId).sort();
    expect(ids).toEqual(["u-admin", "u-leader"]);
  });

  it("keeps manual owner overrides when reconciling", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "leaders" }],
      channelMembers: [
        // Leader who was manually re-added even though they're not currently in the org.
        { channelId: "ch", userId: "u-removed-leader", role: "owner", addedAutomatically: false },
      ],
      orgMemberships: [
        { userId: "u-leader", orgId: "org1", role: "leader", yptCurrentUntil: FUTURE },
      ],
    });
    await reconcileChannelMembers("ch", { now: NOW, prismaClient: prisma });
    const ids = prisma._state.channelMembers.filter((cm) => cm.channelId === "ch").map((cm) => cm.userId).sort();
    expect(ids).toEqual(["u-leader", "u-removed-leader"]);
  });

  it("removes a user whose role left the org (auto-managed only)", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "leaders" }],
      channelMembers: [
        { channelId: "ch", userId: "u-still-here", addedAutomatically: true },
        { channelId: "ch", userId: "u-left", addedAutomatically: true },
      ],
      orgMemberships: [
        { userId: "u-still-here", orgId: "org1", role: "leader", yptCurrentUntil: FUTURE },
        // u-left is no longer in the org.
      ],
    });
    await reconcileChannelMembers("ch", { now: NOW, prismaClient: prisma });
    const ids = prisma._state.channelMembers.filter((cm) => cm.channelId === "ch").map((cm) => cm.userId);
    expect(ids).toEqual(["u-still-here"]);
  });

  it("auto-suspends a patrol channel when reconciliation leaves it short of two-deep", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "patrol", patrolName: "Eagle", isSuspended: false }],
      members: [
        { id: "m1", orgId: "org1", patrol: "Eagle", email: "scout@example.invalid" },
      ],
      users: [{ id: "u-scout", email: "scout@example.invalid" }],
      orgMemberships: [
        { userId: "u-scout", orgId: "org1", role: "scout" },
        // No leaders.
      ],
    });
    await reconcileChannelMembers("ch", { now: NOW, prismaClient: prisma });
    expect(prisma._state.channels[0].isSuspended).toBe(true);
  });

  it("auto-clears suspension when reconciliation restores two-deep (no audit-log fire)", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "patrol", patrolName: "Eagle", isSuspended: true, suspendedReason: "no-current-adults" }],
      channelMembers: [
        { channelId: "ch", userId: "u-l1", addedAutomatically: true },
        { channelId: "ch", userId: "u-l2", addedAutomatically: true },
        { channelId: "ch", userId: "u-scout", addedAutomatically: true },
      ],
      members: [{ id: "m1", orgId: "org1", patrol: "Eagle", email: "scout@x" }],
      users: [{ id: "u-scout", email: "scout@x" }],
      orgMemberships: [
        { userId: "u-scout", orgId: "org1", role: "scout" },
        { userId: "u-l1", orgId: "org1", role: "leader", yptCurrentUntil: FUTURE },
        { userId: "u-l2", orgId: "org1", role: "leader", yptCurrentUntil: FUTURE },
      ],
    });
    await reconcileChannelMembers("ch", { now: NOW, prismaClient: prisma });
    expect(prisma._state.channels[0].isSuspended).toBe(false);
    expect(prisma._state.auditLogs).toHaveLength(0);
  });

  it("is a no-op for custom channels (manual-only membership)", async () => {
    const prisma = fakePrisma({
      channels: [{ id: "ch", orgId: "org1", kind: "custom" }],
    });
    const r = await reconcileChannelMembers("ch", { now: NOW, prismaClient: prisma });
    expect(r).toEqual({ added: 0, removed: 0, postSyncCheck: null });
  });
});

/* ------------------------------------------------------------------ */
/* provisionStandingChannels                                           */
/* ------------------------------------------------------------------ */

describe("provisionStandingChannels", () => {
  it("creates the four standing channels + one per patrol", async () => {
    const prisma = fakePrisma({
      members: [
        { id: "m1", orgId: "org1", patrol: "Eagle" },
        { id: "m2", orgId: "org1", patrol: "Hawk" },
        { id: "m3", orgId: "org1", patrol: "Hawk" }, // duplicate patrol
      ],
      orgMemberships: [
        { userId: "u-l", orgId: "org1", role: "leader", yptCurrentUntil: FUTURE },
      ],
    });
    const r = await provisionStandingChannels({ org: ORG, prismaClient: prisma });
    expect(r.troop.kind).toBe("troop");
    expect(r.parents.kind).toBe("parents");
    expect(r.leaders.kind).toBe("leaders");
    expect(r.patrols.length).toBe(2);
    expect(r.patrols.map((c) => c.patrolName).sort()).toEqual(["Eagle", "Hawk"]);
  });

  it("is idempotent — second call adds nothing", async () => {
    const prisma = fakePrisma({
      members: [{ id: "m1", orgId: "org1", patrol: "Eagle" }],
    });
    await provisionStandingChannels({ org: ORG, prismaClient: prisma });
    const channelsAfterFirst = prisma._state.channels.length;
    await provisionStandingChannels({ org: ORG, prismaClient: prisma });
    expect(prisma._state.channels.length).toBe(channelsAfterFirst);
  });
});

/* ------------------------------------------------------------------ */
/* archiveEndedEventChannels                                           */
/* ------------------------------------------------------------------ */

describe("archiveEndedEventChannels", () => {
  it("archives event channels whose event ended more than 24h ago", async () => {
    const justEnded = new Date(NOW.getTime() - 1 * 60 * 60 * 1000); // 1h ago — not yet
    const longGone = new Date(NOW.getTime() - 30 * 60 * 60 * 1000); // 30h ago — past grace
    const prisma = fakePrisma({
      channels: [
        { id: "ch1", orgId: "org1", kind: "event", eventId: "e1", archivedAt: null },
        { id: "ch2", orgId: "org1", kind: "event", eventId: "e2", archivedAt: null },
        { id: "ch3", orgId: "org1", kind: "event", eventId: "e3", archivedAt: NOW }, // already archived
      ],
      events: [
        { id: "e1", endsAt: justEnded },
        { id: "e2", endsAt: longGone },
        { id: "e3", endsAt: longGone },
      ],
    });
    const r = await archiveEndedEventChannels({ now: NOW, prismaClient: prisma });
    expect(r.archived).toBe(1);
    expect(prisma._state.channels.find((c) => c.id === "ch1").archivedAt).toBeNull();
    expect(prisma._state.channels.find((c) => c.id === "ch2").archivedAt).toEqual(NOW);
  });
});

describe("CHANNEL_KINDS export", () => {
  it("includes the seven kinds the schema documents", () => {
    expect(CHANNEL_KINDS).toEqual([
      "patrol",
      "troop",
      "parents",
      "leaders",
      "event",
      "custom",
      "dm",
    ]);
  });
});
