import { beforeEach, describe, expect, it, vi } from "vitest";

const funds = new Map<string, { orgId: string; code: string; name: string; isSystem: boolean }>();
const key = (w: { orgId_code: { orgId: string; code: string } }) =>
  `${w.orgId_code.orgId}/${w.orgId_code.code}`;

vi.mock("@/lib/db", () => ({
  prisma: {
    fund: {
      findUnique: async ({ where }: { where: { orgId_code: { orgId: string; code: string } } }) =>
        funds.get(key(where)) ?? null,
      upsert: async ({
        where,
        create,
      }: {
        where: { orgId_code: { orgId: string; code: string } };
        create: { orgId: string; code: string; name: string; isSystem: boolean };
      }) => {
        const k = key(where);
        if (!funds.has(k)) funds.set(k, create);
        return funds.get(k);
      },
    },
  },
}));

import { requireSystemFund } from "./provision";

describe("requireSystemFund", () => {
  beforeEach(() => funds.clear());

  it("returns an existing fund", async () => {
    funds.set("o1/general", { orgId: "o1", code: "general", name: "Ops", isSystem: true });
    await expect(requireSystemFund("o1", "general")).resolves.toMatchObject({ name: "Ops" });
  });

  it("creates a missing system fund instead of failing the write", async () => {
    const f = await requireSystemFund("o1", "scout-accounts");
    expect(f).toMatchObject({ code: "scout-accounts", name: "Scout accounts", isSystem: true });
    expect(funds.has("o1/scout-accounts")).toBe(true);
  });

  it("still rejects codes that aren't system funds", async () => {
    await expect(requireSystemFund("o1", "camp-fund")).rejects.toThrow(/Unknown system fund/);
  });
});
