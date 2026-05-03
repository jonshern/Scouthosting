// Direct messaging tests — DM channel creation, reminder-cron candidate
// filtering, and the suppression rules around the email nudge.
//
// All prisma access is mocked so these stay unit-level. The HTTP
// endpoints (POST /api/v1/dm/:userId, GET /admin/members/:id/message)
// will get integration coverage when we run the live test DB.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findOrCreateDmChannel,
  findUnreadDmRemindersDue,
  markDmReminderSent,
  _internal,
} from "../lib/chat.js";
import { runDmReminderTick } from "../lib/dmReminderCron.js";

function makePrismaMock() {
  const channels = [];
  const messages = [];
  const updated = []; // capture markDmReminderSent calls
  return {
    channel: {
      findFirst: vi.fn(async ({ where }) => {
        return (
          channels.find(
            (c) => c.orgId === where.orgId && c.kind === where.kind && c.name === where.name,
          ) || null
        );
      }),
      create: vi.fn(async ({ data }) => {
        const id = `c${channels.length + 1}`;
        const channel = { id, orgId: data.orgId, kind: data.kind, name: data.name, postPolicy: data.postPolicy };
        channels.push(channel);
        return channel;
      }),
    },
    message: {
      findMany: vi.fn(async () => messages.slice()),
      update: vi.fn(async ({ where, data }) => {
        updated.push({ id: where.id, data });
        const m = messages.find((x) => x.id === where.id);
        if (m) Object.assign(m, data);
        return m;
      }),
    },
    user: { findUnique: vi.fn(async () => null) },
    member: { findFirst: vi.fn(async () => null) },
    _state: { channels, messages, updated },
  };
}

describe("findOrCreateDmChannel", () => {
  it("creates a Channel(kind='dm') with both users as members on first call", async () => {
    const prisma = makePrismaMock();
    const ch = await findOrCreateDmChannel("org1", "u-alice", "u-bob", { prismaClient: prisma });
    expect(ch.kind).toBe("dm");
    // Sorted-pair name: "dm:u-alice:u-bob" regardless of arg order
    expect(ch.name).toBe("dm:u-alice:u-bob");
    expect(prisma.channel.create).toHaveBeenCalledTimes(1);
    const created = prisma.channel.create.mock.calls[0][0].data;
    const userIds = (created.members?.create || []).map((m) => m.userId).sort();
    expect(userIds).toEqual(["u-alice", "u-bob"]);
  });

  it("is stable: Alice→Bob and Bob→Alice resolve to the same channel name", async () => {
    expect(_internal.dmChannelName("u-alice", "u-bob")).toBe("dm:u-alice:u-bob");
    expect(_internal.dmChannelName("u-bob", "u-alice")).toBe("dm:u-alice:u-bob");
  });

  it("returns the existing channel without creating a duplicate on the second call", async () => {
    const prisma = makePrismaMock();
    const a = await findOrCreateDmChannel("org1", "u-alice", "u-bob", { prismaClient: prisma });
    const b = await findOrCreateDmChannel("org1", "u-bob", "u-alice", { prismaClient: prisma });
    expect(a.id).toBe(b.id);
    expect(prisma.channel.create).toHaveBeenCalledTimes(1);
  });

  it("rejects self-DM", async () => {
    const prisma = makePrismaMock();
    await expect(
      findOrCreateDmChannel("org1", "u-alice", "u-alice", { prismaClient: prisma }),
    ).rejects.toThrow(/two distinct/);
  });

  it("requires a prismaClient (no implicit default import)", async () => {
    await expect(findOrCreateDmChannel("org1", "u-alice", "u-bob", {})).rejects.toThrow(
      /prismaClient required/,
    );
  });
});

describe("findUnreadDmRemindersDue", () => {
  function fakeFindMany(results) {
    return {
      message: {
        findMany: vi.fn(async () => results),
        update: vi.fn(),
      },
    };
  }

  const NOW = new Date("2026-05-03T10:00:00Z");
  const OLD = new Date("2026-05-03T09:00:00Z"); // 1 hour ago — past threshold
  const RECENT = new Date("2026-05-03T09:55:00Z"); // 5 min ago — too fresh

  it("returns empty when no candidate rows match", async () => {
    const prisma = fakeFindMany([]);
    const out = await findUnreadDmRemindersDue({ now: NOW, prismaClient: prisma });
    expect(out).toEqual([]);
  });

  it("yields one reminder per unread recipient on an old DM", async () => {
    const prisma = fakeFindMany([
      {
        id: "msg-1",
        authorId: "u-alice",
        createdAt: OLD,
        body: "Hey, did you see the campout email?",
        author: { id: "u-alice", displayName: "Alice" },
        channel: {
          id: "dm-1",
          orgId: "org-1",
          org: { slug: "troop100", displayName: "Troop 100" },
          members: [
            { userId: "u-alice", lastReadAt: NOW }, // author has read
            { userId: "u-bob", lastReadAt: null },  // bob hasn't
          ],
        },
      },
    ]);
    const out = await findUnreadDmRemindersDue({ now: NOW, prismaClient: prisma });
    expect(out.length).toBe(1);
    expect(out[0].recipientUserId).toBe("u-bob");
    expect(out[0].message.id).toBe("msg-1");
  });

  it("filters out a recipient who already read the message", async () => {
    const prisma = fakeFindMany([
      {
        id: "msg-2",
        authorId: "u-alice",
        createdAt: OLD,
        body: "x",
        author: { id: "u-alice", displayName: "Alice" },
        channel: {
          id: "dm-1",
          orgId: "org-1",
          org: { slug: "troop100", displayName: "Troop 100" },
          members: [
            { userId: "u-alice", lastReadAt: NOW },
            { userId: "u-bob", lastReadAt: NOW }, // already saw it
          ],
        },
      },
    ]);
    const out = await findUnreadDmRemindersDue({ now: NOW, prismaClient: prisma });
    expect(out).toEqual([]);
  });

  it("skips when the recipient's lastReadAt is at or after the message time", async () => {
    const prisma = fakeFindMany([
      {
        id: "msg-3",
        authorId: "u-alice",
        createdAt: OLD,
        body: "x",
        author: { id: "u-alice", displayName: "Alice" },
        channel: {
          id: "dm-1",
          orgId: "org-1",
          org: { slug: "troop100", displayName: "Troop 100" },
          members: [
            { userId: "u-alice", lastReadAt: NOW },
            { userId: "u-bob", lastReadAt: OLD }, // exactly equal → seen
          ],
        },
      },
    ]);
    const out = await findUnreadDmRemindersDue({ now: NOW, prismaClient: prisma });
    expect(out).toEqual([]);
  });
});

describe("runDmReminderTick", () => {
  function dueRow({ messageId, recipientUserId = "u-bob", recipientUserEmail = "bob@example.invalid" } = {}) {
    return {
      message: {
        id: messageId,
        authorId: "u-alice",
        body: "Hey can you bring snacks?",
        createdAt: new Date("2026-05-03T09:00:00Z"),
        author: { id: "u-alice", displayName: "Alice" },
      },
      recipientUserId,
      channel: {
        id: "dm-1",
        orgId: "org-1",
        org: { slug: "troop100", displayName: "Troop 100" },
        members: [],
      },
      _userEmail: recipientUserEmail,
    };
  }

  function makePrisma(rows) {
    const stamped = [];
    return {
      stamped,
      message: {
        findMany: vi.fn(async () => rows.map((r) => r.message && {
          ...r.message,
          channel: { ...r.channel, members: [
            { userId: r.message.authorId, lastReadAt: new Date("2026-05-03T10:00:00Z") },
            { userId: r.recipientUserId, lastReadAt: null },
          ] },
        })),
        update: vi.fn(async ({ where, data }) => {
          stamped.push({ id: where.id, data });
        }),
      },
      user: {
        findUnique: vi.fn(async ({ where }) => {
          const r = rows.find((x) => x.recipientUserId === where.id);
          return r ? { email: r._userEmail } : null;
        }),
      },
      member: {
        findFirst: vi.fn(async ({ where }) => {
          const r = rows.find((x) => x._userEmail === where.email);
          return r?._member ?? null;
        }),
      },
    };
  }

  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-05-03T10:00:00Z")));

  it("sends a reminder + stamps emailReminderSentAt for the basic case", async () => {
    const rows = [dueRow({ messageId: "msg-1" })];
    rows[0]._member = { email: "bob@example.invalid", emailUnsubscribed: false, bouncedAt: null, commPreference: "email", status: "active" };
    const prisma = makePrisma(rows);
    const sendMail = vi.fn(async () => {});
    const result = await runDmReminderTick({ prismaClient: prisma, sendMail });
    expect(result.sent).toBe(1);
    expect(sendMail).toHaveBeenCalledOnce();
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe("bob@example.invalid");
    expect(arg.subject).toMatch(/Alice.*Troop 100/);
    expect(arg.text).toMatch(/Hey can you bring snacks\?/);
    expect(prisma.stamped).toEqual([{ id: "msg-1", data: expect.objectContaining({ emailReminderSentAt: expect.any(Date) }) }]);
  });

  it("skips unsubscribed members + still stamps so we don't re-evaluate", async () => {
    const rows = [dueRow({ messageId: "msg-2" })];
    rows[0]._member = { email: "bob@example.invalid", emailUnsubscribed: true, bouncedAt: null, commPreference: "email", status: "active" };
    const prisma = makePrisma(rows);
    const sendMail = vi.fn(async () => {});
    const result = await runDmReminderTick({ prismaClient: prisma, sendMail });
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(sendMail).not.toHaveBeenCalled();
    expect(prisma.stamped.length).toBe(1); // stamped to avoid re-eval
  });

  it("skips bounced members", async () => {
    const rows = [dueRow({ messageId: "msg-3" })];
    rows[0]._member = { email: "bob@example.invalid", emailUnsubscribed: false, bouncedAt: new Date(), commPreference: "email", status: "active" };
    const prisma = makePrisma(rows);
    const sendMail = vi.fn(async () => {});
    const result = await runDmReminderTick({ prismaClient: prisma, sendMail });
    expect(result.sent).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("skips members with commPreference=none", async () => {
    const rows = [dueRow({ messageId: "msg-4" })];
    rows[0]._member = { email: "bob@example.invalid", emailUnsubscribed: false, bouncedAt: null, commPreference: "none", status: "active" };
    const prisma = makePrisma(rows);
    const sendMail = vi.fn(async () => {});
    const result = await runDmReminderTick({ prismaClient: prisma, sendMail });
    expect(result.sent).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("skips prospect (lead) recipients", async () => {
    const rows = [dueRow({ messageId: "msg-5" })];
    rows[0]._member = { email: "bob@example.invalid", emailUnsubscribed: false, bouncedAt: null, commPreference: "email", status: "prospect" };
    const prisma = makePrisma(rows);
    const sendMail = vi.fn(async () => {});
    const result = await runDmReminderTick({ prismaClient: prisma, sendMail });
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does NOT stamp the message when sendMail throws — lets the next tick retry", async () => {
    const rows = [dueRow({ messageId: "msg-6" })];
    rows[0]._member = { email: "bob@example.invalid", emailUnsubscribed: false, bouncedAt: null, commPreference: "email", status: "active" };
    const prisma = makePrisma(rows);
    const sendMail = vi.fn(async () => {
      throw new Error("smtp transient");
    });
    const result = await runDmReminderTick({ prismaClient: prisma, sendMail });
    expect(result.sent).toBe(0);
    expect(prisma.stamped).toEqual([]); // not stamped — will retry
  });
});
