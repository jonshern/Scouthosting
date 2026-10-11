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

import { findOrCreateDmChannel, unsuspendChannel } from "./index";

const ORG = "org_1";
const FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

describe("chat/findOrCreateDmChannel — no 1:1 with youth", () => {
  function stub(roles: Record<string, string>) {
    const created: unknown[] = [];
    const prisma = {
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
