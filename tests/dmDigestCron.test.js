// Weekly DM digest cron tests. Pin the rendering of the digest body
// + the suppression rules + the 7-day cadence gate.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildDigest, runDmDigestTick } from "../lib/dmDigestCron.js";

describe("buildDigest", () => {
  const NOW = new Date("2026-05-10T12:00:00Z");
  const TWO_DAYS_AGO = new Date("2026-05-08T12:00:00Z");

  beforeEach(() => vi.useFakeTimers().setSystemTime(NOW));

  it("renders subject + body for a single org with one item", () => {
    const out = buildDigest({
      recipientUser: { displayName: "Bob", email: "bob@example.invalid" },
      items: [
        {
          authorDisplayName: "Alice",
          body: "Don't forget the campout this weekend",
          createdAt: TWO_DAYS_AGO,
          orgSlug: "troop100",
          orgDisplayName: "Troop 100",
        },
      ],
      apexDomain: "compass.app",
    });
    expect(out.subject).toBe("1 unread message in Troop 100");
    expect(out.text).toMatch(/Alice \(2d ago\): Don't forget the campout/);
    expect(out.text).toContain("https://troop100.compass.app/chat");
    expect(out.html).toContain("<strong>Alice</strong>");
  });

  it("pluralizes for multiple items", () => {
    const out = buildDigest({
      recipientUser: {},
      items: [
        { authorDisplayName: "A", body: "x", createdAt: TWO_DAYS_AGO, orgSlug: "t", orgDisplayName: "T" },
        { authorDisplayName: "B", body: "y", createdAt: TWO_DAYS_AGO, orgSlug: "t", orgDisplayName: "T" },
      ],
      apexDomain: "compass.app",
    });
    expect(out.subject).toBe("2 unread messages in T");
  });

  it("falls back to generic 'Compass' when items span multiple orgs", () => {
    const out = buildDigest({
      recipientUser: {},
      items: [
        { authorDisplayName: "A", body: "x", createdAt: TWO_DAYS_AGO, orgSlug: "t1", orgDisplayName: "T1" },
        { authorDisplayName: "B", body: "y", createdAt: TWO_DAYS_AGO, orgSlug: "t2", orgDisplayName: "T2" },
      ],
      apexDomain: "compass.app",
    });
    expect(out.subject).toBe("2 unread messages in Compass");
    expect(out.text).toContain("Compass");
  });

  it("truncates long item lists to 25 with a '…and N more' line", () => {
    const items = Array.from({ length: 30 }).map((_, i) => ({
      authorDisplayName: `A${i}`,
      body: `m${i}`,
      createdAt: TWO_DAYS_AGO,
      orgSlug: "t",
      orgDisplayName: "T",
    }));
    const out = buildDigest({ recipientUser: {}, items, apexDomain: "compass.app" });
    expect(out.subject).toBe("30 unread messages in T");
    expect(out.text).toContain("…and 5 more.");
  });

  it("escapes HTML in body and author name (XSS through DM body)", () => {
    const out = buildDigest({
      recipientUser: {},
      items: [
        {
          authorDisplayName: "<script>",
          body: "<img src=x onerror=alert(1)>",
          createdAt: TWO_DAYS_AGO,
          orgSlug: "t",
          orgDisplayName: "T",
        },
      ],
      apexDomain: "compass.app",
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).not.toContain("<img src=x");
    expect(out.html).toContain("&lt;script&gt;");
  });
});

describe("runDmDigestTick", () => {
  function ctx({ messages = [], users = {}, members = {} } = {}) {
    const updates = [];
    const sentMail = [];
    const prisma = {
      message: { findMany: vi.fn(async () => messages) },
      user: {
        findUnique: vi.fn(async ({ where }) => users[where.id] || null),
        update: vi.fn(async ({ where, data }) => {
          updates.push({ id: where.id, data });
          if (users[where.id]) Object.assign(users[where.id], data);
          return users[where.id];
        }),
      },
      member: { findFirst: vi.fn(async ({ where }) => members[where.email] || null) },
    };
    const sendMail = vi.fn(async (msg) => {
      sentMail.push(msg);
    });
    return { prisma, sendMail, updates, sentMail };
  }

  const NOW = new Date("2026-05-10T12:00:00Z");
  const TWO_DAYS_AGO = new Date("2026-05-08T12:00:00Z");

  beforeEach(() => vi.useFakeTimers().setSystemTime(NOW));

  function dmRow({ id, recipientId = "u-bob", read = false }) {
    return {
      id,
      authorId: "u-alice",
      body: "msg " + id,
      createdAt: TWO_DAYS_AGO,
      author: { displayName: "Alice" },
      channel: {
        orgId: "org1",
        org: { slug: "troop100", displayName: "Troop 100" },
        members: [
          { userId: "u-alice", lastReadAt: NOW },
          { userId: recipientId, lastReadAt: read ? NOW : null },
        ],
      },
    };
  }

  it("digests an eligible user once", async () => {
    const { prisma, sendMail, sentMail, updates } = ctx({
      messages: [dmRow({ id: "m1" })],
      users: {
        "u-bob": { email: "bob@example.invalid", displayName: "Bob", lastDmDigestSentAt: null },
      },
      members: {
        "bob@example.invalid": { emailUnsubscribed: false, bouncedAt: null, commPreference: "email", status: "active" },
      },
    });
    const result = await runDmDigestTick({ prismaClient: prisma, sendMail });
    expect(result.digestsSent).toBe(1);
    expect(sentMail.length).toBe(1);
    expect(sentMail[0].to).toBe("bob@example.invalid");
    expect(sentMail[0].subject).toMatch(/1 unread message in Troop 100/);
    expect(updates).toEqual([{ id: "u-bob", data: { lastDmDigestSentAt: NOW } }]);
  });

  it("skips when the recipient has read the message", async () => {
    const { prisma, sendMail, sentMail } = ctx({
      messages: [dmRow({ id: "m2", read: true })],
      users: { "u-bob": { email: "bob@example.invalid", displayName: "Bob", lastDmDigestSentAt: null } },
    });
    const result = await runDmDigestTick({ prismaClient: prisma, sendMail });
    expect(result.digestsSent).toBe(0);
    expect(sentMail).toEqual([]);
  });

  it("skips a user digested less than 7 days ago + does NOT touch lastDmDigestSentAt", async () => {
    const fiveDaysAgo = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000);
    const { prisma, sendMail, sentMail, updates } = ctx({
      messages: [dmRow({ id: "m3" })],
      users: { "u-bob": { email: "bob@example.invalid", displayName: "Bob", lastDmDigestSentAt: fiveDaysAgo } },
    });
    const result = await runDmDigestTick({ prismaClient: prisma, sendMail });
    expect(result.digestsSent).toBe(0);
    expect(result.recipientsSkipped).toBe(1);
    expect(sentMail).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("skips unsubscribed members + stamps lastDmDigestSentAt to avoid re-eval", async () => {
    const { prisma, sendMail, sentMail, updates } = ctx({
      messages: [dmRow({ id: "m4" })],
      users: { "u-bob": { email: "bob@example.invalid", displayName: "Bob", lastDmDigestSentAt: null } },
      members: { "bob@example.invalid": { emailUnsubscribed: true, bouncedAt: null, commPreference: "email", status: "active" } },
    });
    const result = await runDmDigestTick({ prismaClient: prisma, sendMail });
    expect(result.digestsSent).toBe(0);
    expect(result.recipientsSkipped).toBe(1);
    expect(sentMail).toEqual([]);
    expect(updates.length).toBe(1); // stamped to avoid re-eval
  });

  it("skips prospects (leads should NOT receive DM digests)", async () => {
    const { prisma, sendMail, sentMail } = ctx({
      messages: [dmRow({ id: "m5" })],
      users: { "u-bob": { email: "bob@example.invalid", displayName: "Bob", lastDmDigestSentAt: null } },
      members: { "bob@example.invalid": { emailUnsubscribed: false, bouncedAt: null, commPreference: "email", status: "prospect" } },
    });
    const result = await runDmDigestTick({ prismaClient: prisma, sendMail });
    expect(result.digestsSent).toBe(0);
    expect(sentMail).toEqual([]);
  });

  it("does NOT stamp on transient sendMail failure", async () => {
    const prisma = {
      message: { findMany: vi.fn(async () => [dmRow({ id: "m6" })]) },
      user: {
        findUnique: vi.fn(async () => ({ email: "bob@example.invalid", displayName: "Bob", lastDmDigestSentAt: null })),
        update: vi.fn(),
      },
      member: { findFirst: vi.fn(async () => null) },
    };
    const sendMail = vi.fn(async () => {
      throw new Error("smtp transient");
    });
    const result = await runDmDigestTick({ prismaClient: prisma, sendMail });
    expect(result.digestsSent).toBe(0);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
