// Youth-protection rules beyond the two-deep count itself:
//   - no 1:1 DM channel may include a scout
//   - a leader can't unsuspend a channel that still fails two-deep
//
// Hand-rolled prisma stubs; no DB.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/realtime/bus", () => ({
  publishSuspended: vi.fn(),
  publishUnsuspended: vi.fn(),
}));

import { findOrCreateDmChannel, sweepChannelTwoDeep, unsuspendChannel } from "./index";

const ORG = "org_1";
const FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

describe("chat/findOrCreateDmChannel — no 1:1 with youth", () => {
  function stub(roles: Record<string, string>, youthRoster: string[] = []) {
    const created: unknown[] = [];
    const prisma = {
      user: {
        findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.map((id) => ({ id, email: `${id}@example.invalid` })),
      },
      member: {
        findMany: async ({ where }: { where: { email: { in: string[] } } }) =>
          youthRoster
            .map((id) => `${id}@example.invalid`)
            .filter((e) => where.email.in.includes(e))
            .map((email) => ({ email })),
      },
      orgMembership: {
        findMany: async ({ where }: { where: { userId: { in: string[] } } }) =>
          where.userId.in
            .filter((id) => roles[id])
            .map((id) => ({ userId: id, role: roles[id] })),
      },
      channel: {
        findFirst: async () => null,
        create: async (args: unknown) => {
          created.push(args);
          return { id: "dm1" };
        },
      },
    } as unknown as PrismaClient;
    return { prisma, created };
  }

  it("creates a DM between two adults", async () => {
    const { prisma, created } = stub({ a: "leader", b: "parent" });
    await expect(findOrCreateDmChannel(ORG, "a", "b", { prismaClient: prisma })).resolves.toEqual({
      id: "dm1",
    });
    expect(created).toHaveLength(1);
  });

  it("refuses an adult-scout DM", async () => {
    const { prisma, created } = stub({ a: "leader", b: "scout" });
    await expect(
      findOrCreateDmChannel(ORG, "a", "b", { prismaClient: prisma }),
    ).rejects.toMatchObject({ code: "DM_YOUTH_BLOCKED" });
    expect(created).toHaveLength(0);
  });

  it("refuses a scout-scout DM", async () => {
    const { prisma } = stub({ a: "scout", b: "scout" });
    await expect(
      findOrCreateDmChannel(ORG, "a", "b", { prismaClient: prisma }),
    ).rejects.toMatchObject({ code: "DM_YOUTH_BLOCKED" });
  });

  it("refuses a self-registered scout who only has the default parent role", async () => {
    const { prisma } = stub({ a: "leader", b: "parent" }, ["b"]);
    await expect(
      findOrCreateDmChannel(ORG, "a", "b", { prismaClient: prisma }),
    ).rejects.toMatchObject({ code: "DM_YOUTH_BLOCKED" });
  });

  it("refuses when one side isn't a member of the org", async () => {
    const { prisma } = stub({ a: "leader" });
    await expect(
      findOrCreateDmChannel(ORG, "a", "outsider", { prismaClient: prisma }),
    ).rejects.toMatchObject({ code: "DM_YOUTH_BLOCKED" });
  });
});

describe("chat/unsuspendChannel — two-deep must be met first", () => {
  let updates: unknown[];
  let messages: unknown[];

  function stub(members: Array<{ role: string; ypt: Date | null }>) {
    updates = [];
    messages = [];
    return {
      channel: {
        findUnique: async () => ({
          id: "ch1",
          orgId: ORG,
          kind: "patrol",
          isSuspended: true,
          name: "Eagles patrol",
        }),
        update: async (args: unknown) => {
          updates.push(args);
          return {};
        },
      },
      channelMember: {
        findMany: async () =>
          members.map((m) => ({
            user: { memberships: [{ role: m.role, yptCurrentUntil: m.ypt }] },
          })),
      },
      member: { findMany: async () => [] },
      message: {
        create: async (args: unknown) => {
          messages.push(args);
          return {};
        },
      },
    } as unknown as PrismaClient;
  }

  beforeEach(() => {
    updates = [];
    messages = [];
  });

  it("refuses while the channel has youth and only one current adult", async () => {
    const prisma = stub([
      { role: "scout", ypt: null },
      { role: "leader", ypt: FUTURE },
    ]);
    const r = await unsuspendChannel("ch1", { prismaClient: prisma });
    expect(r).toEqual({ ok: false, reason: "only-one-current-adult" });
    expect(updates).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  it("unsuspends once two current adults are present", async () => {
    const prisma = stub([
      { role: "scout", ypt: null },
      { role: "leader", ypt: FUTURE },
      { role: "admin", ypt: FUTURE },
    ]);
    const r = await unsuspendChannel("ch1", { prismaClient: prisma });
    expect(r).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
    expect(messages).toHaveLength(1);
  });
});

describe("chat/sweepChannelTwoDeep — nightly backstop", () => {
  it("suspends a channel whose only second leader's YPT lapsed", async () => {
    const PAST = new Date(Date.now() - 86_400_000);
    const suspended: string[] = [];
    const prisma = {
      channel: {
        findMany: async () => [{ id: "ok" }, { id: "lapsed" }],
        findUnique: async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          orgId: ORG,
          kind: "patrol",
          isSuspended: false,
          name: where.id,
        }),
        update: async ({ where }: { where: { id: string } }) => {
          suspended.push(where.id);
          return {};
        },
      },
      channelMember: {
        findMany: async ({ where }: { where: { channelId: string } }) => [
          { user: { memberships: [{ role: "scout", yptCurrentUntil: null }] } },
          { user: { memberships: [{ role: "leader", yptCurrentUntil: FUTURE }] } },
          {
            user: {
              memberships: [
                { role: "leader", yptCurrentUntil: where.channelId === "ok" ? FUTURE : PAST },
              ],
            },
          },
        ],
      },
      member: { findMany: async () => [] },
      message: { create: async () => ({}) },
    } as unknown as PrismaClient;
    const r = await sweepChannelTwoDeep({ prismaClient: prisma });
    expect(r).toEqual({ checked: 2, suspended: 1 });
    expect(suspended).toEqual(["lapsed"]);
  });
});
