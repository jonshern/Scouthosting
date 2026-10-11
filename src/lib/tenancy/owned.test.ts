import { describe, expect, it, vi } from "vitest";

const rows: Record<string, Array<{ id: string; orgId: string }>> = {
  member: [
    { id: "m1", orgId: "A" },
    { id: "m2", orgId: "A" },
    { id: "mB", orgId: "B" },
  ],
};

vi.mock("@/lib/db", () => {
  const make = (model: string) => ({
    findMany: async ({ where }: { where: { id: { in: string[] }; orgId: string } }) =>
      (rows[model] ?? [])
        .filter((r) => r.orgId === where.orgId && where.id.in.includes(r.id))
        .map((r) => ({ id: r.id })),
  });
  return {
    prisma: {
      member: make("member"),
      location: make("location"),
      event: make("event"),
      fund: make("fund"),
    },
  };
});

import { ownedIdOrNull, ownedIds } from "./owned";

describe("ownedIds", () => {
  it("drops ids that belong to another unit", async () => {
    expect(await ownedIds("member", "A", ["m1", "mB", "m2"])).toEqual(["m1", "m2"]);
  });
  it("dedupes and ignores blanks", async () => {
    expect(await ownedIds("member", "A", ["m1", "", "m1"])).toEqual(["m1"]);
  });
  it("returns [] without querying for empty input", async () => {
    expect(await ownedIds("member", "A", [])).toEqual([]);
  });
});

describe("ownedIdOrNull", () => {
  it("empty input means no link", async () => {
    expect(await ownedIdOrNull("member", "A", "")).toBeNull();
    expect(await ownedIdOrNull("member", "A", undefined)).toBeNull();
  });
  it("returns the id when it's this unit's", async () => {
    expect(await ownedIdOrNull("member", "A", "m1")).toBe("m1");
  });
  it("returns false for another unit's id so the write is rejected", async () => {
    expect(await ownedIdOrNull("member", "A", "mB")).toBe(false);
    expect(await ownedIdOrNull("member", "A", "nope")).toBe(false);
  });
});
