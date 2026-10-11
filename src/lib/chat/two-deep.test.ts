// YPT two-deep guard — exercises every branch of checkChannelTwoDeep.
//
// Uses a hand-rolled prismaClient stub. Tests don't touch a real DB.

import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { checkChannelTwoDeep } from "./index";

type Membership = { role: string; yptCurrentUntil: Date | null };
type ChannelMember = { user: { memberships: Membership[] } };

function makePrismaStub(opts: {
  channel: { id: string; orgId: string; kind: string } | null;
  channelMembers: ChannelMember[];
}): PrismaClient {
  return {
    channel: {
      findUnique: async () => opts.channel,
    },
    channelMember: {
      findMany: async () => opts.channelMembers,
    },
  } as unknown as PrismaClient;
}

const ORG = "org_1";
const FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

describe("chat/checkChannelTwoDeep — gates", () => {
  it("missing channelId throws", async () => {
    await expect(
      checkChannelTwoDeep("", { prismaClient: {} as PrismaClient }),
    ).rejects.toThrow(/missing channelId/);
  });

  it("missing prismaClient throws", async () => {
    await expect(
      checkChannelTwoDeep("ch1", { prismaClient: undefined as unknown as PrismaClient }),
    ).rejects.toThrow(/missing prismaClient/);
  });

  it("returns 'channel-not-found' when channel doesn't exist", async () => {
    const prisma = makePrismaStub({ channel: null, channelMembers: [] });
    const r = await checkChannelTwoDeep("missing", { prismaClient: prisma });
    expect(r).toEqual({
      ok: false,
      hasYouth: false,
      currentAdultCount: 0,
      reason: "channel-not-found",
    });
  });

  it("leaders-kind channel with only adults passes", async () => {
    const prisma = makePrismaStub({
      channel: { id: "ch1", orgId: ORG, kind: "leaders" },
      channelMembers: [
        { user: { memberships: [{ role: "leader", yptCurrentUntil: FUTURE }] } },
      ],
    });
    const r = await checkChannelTwoDeep("ch1", { prismaClient: prisma });
    expect(r.ok).toBe(true);
    expect(r.hasYouth).toBe(false);
  });

  it("leaders-kind channel gets no free pass when a scout was added by hand", async () => {
    const prisma = makePrismaStub({
      channel: { id: "ch1", orgId: ORG, kind: "leaders" },
      channelMembers: [
        { user: { memberships: [{ role: "scout", yptCurrentUntil: null }] } },
        { user: { memberships: [{ role: "leader", yptCurrentUntil: FUTURE }] } },
      ],
    });
    const r = await checkChannelTwoDeep("ch1", { prismaClient: prisma });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("only-one-current-adult");
  });
});

describe("chat/checkChannelTwoDeep — youth + adult counting", () => {
  it("no-youth channel passes regardless of adult count", async () => {
    const prisma = makePrismaStub({
      channel: { id: "ch1", orgId: ORG, kind: "troop" },
      channelMembers: [
        { user: { memberships: [{ role: "parent", yptCurrentUntil: null }] } },
        { user: { memberships: [{ role: "leader", yptCurrentUntil: PAST }] } }, // expired YPT
      ],
    });
    const r = await checkChannelTwoDeep("ch1", { prismaClient: prisma });
    expect(r.ok).toBe(true);
    expect(r.hasYouth).toBe(false);
  });

  it("youth + 0 current adults → no-current-adults", async () => {
    const prisma = makePrismaStub({
      channel: { id: "ch1", orgId: ORG, kind: "patrol" },
      channelMembers: [{ user: { memberships: [{ role: "scout", yptCurrentUntil: null }] } }],
    });
    const r = await checkChannelTwoDeep("ch1", { prismaClient: prisma });
    expect(r.ok).toBe(false);
    expect(r.hasYouth).toBe(true);
    expect(r.currentAdultCount).toBe(0);
    expect(r.reason).toBe("no-current-adults");
  });

  it("youth + exactly 1 current adult → only-one-current-adult", async () => {
    const prisma = makePrismaStub({
      channel: { id: "ch1", orgId: ORG, kind: "patrol" },
      channelMembers: [
        { user: { memberships: [{ role: "scout", yptCurrentUntil: null }] } },
        { user: { memberships: [{ role: "leader", yptCurrentUntil: FUTURE }] } },
      ],
    });
    const r = await checkChannelTwoDeep("ch1", { prismaClient: prisma });
    expect(r.ok).toBe(false);
    expect(r.currentAdultCount).toBe(1);
    expect(r.reason).toBe("only-one-current-adult");
  });

  it("youth + ≥2 current adults → ok", async () => {
    const prisma = makePrismaStub({
      channel: { id: "ch1", orgId: ORG, kind: "troop" },
      channelMembers: [
        { user: { memberships: [{ role: "scout", yptCurrentUntil: null }] } },
        { user: { memberships: [{ role: "leader", yptCurrentUntil: FUTURE }] } },
        { user: { memberships: [{ role: "admin", yptCurrentUntil: FUTURE }] } },
      ],
    });
    const r = await checkChannelTwoDeep("ch1", { prismaClient: prisma });
    expect(r.ok).toBe(true);
    expect(r.currentAdultCount).toBe(2);
  });

  it("expired YPT does NOT count as current adult", async () => {
    const prisma = makePrismaStub({
      channel: { id: "ch1", orgId: ORG, kind: "troop" },
      channelMembers: [
        { user: { memberships: [{ role: "scout", yptCurrentUntil: null }] } },
        { user: { memberships: [{ role: "leader", yptCurrentUntil: PAST }] } },
        { user: { memberships: [{ role: "leader", yptCurrentUntil: FUTURE }] } },
      ],
    });
    const r = await checkChannelTwoDeep("ch1", { prismaClient: prisma });
    expect(r.ok).toBe(false);
    expect(r.currentAdultCount).toBe(1);
    expect(r.reason).toBe("only-one-current-adult");
  });

  it("parents do NOT satisfy two-deep — only leader/admin do", async () => {
    const prisma = makePrismaStub({
      channel: { id: "ch1", orgId: ORG, kind: "troop" },
      channelMembers: [
        { user: { memberships: [{ role: "scout", yptCurrentUntil: null }] } },
        { user: { memberships: [{ role: "parent", yptCurrentUntil: FUTURE }] } },
        { user: { memberships: [{ role: "parent", yptCurrentUntil: FUTURE }] } },
      ],
    });
    const r = await checkChannelTwoDeep("ch1", { prismaClient: prisma });
    expect(r.ok).toBe(false);
    expect(r.currentAdultCount).toBe(0);
  });

  it("orphaned channel members (no membership row) count as youth, not adults", async () => {
    const prisma = makePrismaStub({
      channel: { id: "ch1", orgId: ORG, kind: "custom" },
      channelMembers: [
        { user: { memberships: [] } }, // orphan: can't confirm they're an adult
        { user: { memberships: [{ role: "leader", yptCurrentUntil: FUTURE }] } },
      ],
    });
    const r = await checkChannelTwoDeep("ch1", { prismaClient: prisma });
    expect(r.ok).toBe(false);
    expect(r.hasYouth).toBe(true);
    expect(r.reason).toBe("only-one-current-adult");
  });

  it("orphans are fine once two YPT-current adults are present", async () => {
    const prisma = makePrismaStub({
      channel: { id: "ch1", orgId: ORG, kind: "troop" },
      channelMembers: [
        { user: { memberships: [] } },
        { user: { memberships: [{ role: "leader", yptCurrentUntil: FUTURE }] } },
        { user: { memberships: [{ role: "leader", yptCurrentUntil: FUTURE }] } },
      ],
    });
    const r = await checkChannelTwoDeep("ch1", { prismaClient: prisma });
    expect(r.ok).toBe(true);
  });
});
