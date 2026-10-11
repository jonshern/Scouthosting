// Slot capacity + waitlist rules against an in-memory transaction stub.
// The real row lock is exercised by slots.db.test.ts when a test
// database is available.

import { describe, expect, it } from "vitest";
import { SlotFullError, claimSlot, releaseSlot } from "./index";

type Row = {
  id: string;
  slotId: string;
  userId: string | null;
  email: string | null;
  scoutName: string;
  waitlisted: boolean;
  createdAt: Date;
};

function makeTx(slot: { capacity: number; allowWaitlist: boolean }, rows: Row[] = []) {
  const calls: string[] = [];
  let seq = rows.length;
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      if (k === "id" && v && typeof v === "object" && "in" in v) {
        return (v as { in: string[] }).in.includes(r.id);
      }
      return (r as Record<string, unknown>)[k] === v;
    });
  const tx = {
    $queryRaw: async () => {
      calls.push("lock");
      return [];
    },
    signupSlot: {
      findUnique: async () => ({ id: "s1", ...slot }),
    },
    slotAssignment: {
      count: async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter((r) => matches(r, where)).length,
      create: async ({ data }: { data: Omit<Row, "id" | "createdAt"> }) => {
        calls.push("create");
        const row = { ...data, id: `a${++seq}`, createdAt: new Date(Date.now() + seq) };
        rows.push(row as Row);
        return row;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((r) => matches(r, where)) ?? null,
      findMany: async ({ where, take }: { where: Record<string, unknown>; take: number }) =>
        rows
          .filter((r) => matches(r, where))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(0, take),
      delete: async ({ where }: { where: { id: string } }) => {
        const i = rows.findIndex((r) => r.id === where.id);
        rows.splice(i, 1);
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        for (const r of rows) if (matches(r, where)) Object.assign(r, data);
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
    },
  };
  return { tx: tx as never, rows, calls };
}

const row = (id: string, over: Partial<Row> = {}): Row => ({
  id,
  slotId: "s1",
  userId: null,
  email: `${id}@example.invalid`,
  scoutName: "",
  waitlisted: false,
  createdAt: new Date(Number(id.replace(/\D/g, "")) * 1000),
  ...over,
});

const claim = (email: string, userId: string | null = null) => ({
  orgId: "o1",
  slotId: "s1",
  userId,
  name: email,
  email,
  notes: null,
});

describe("claimSlot", () => {
  it("locks the slot row before counting", async () => {
    const { tx, calls } = makeTx({ capacity: 1, allowWaitlist: true });
    await claimSlot(tx, claim("a@x"));
    expect(calls[0]).toBe("lock");
  });

  it("takes an open seat", async () => {
    const { tx, rows } = makeTx({ capacity: 2, allowWaitlist: true }, [row("a1")]);
    await expect(claimSlot(tx, claim("b@x"))).resolves.toEqual({ waitlisted: false });
    expect(rows.filter((r) => !r.waitlisted)).toHaveLength(2);
  });

  it("joins the waitlist when full", async () => {
    const { tx } = makeTx({ capacity: 1, allowWaitlist: true }, [row("a1")]);
    await expect(claimSlot(tx, claim("b@x"))).resolves.toEqual({ waitlisted: true });
  });

  it("refuses when full and waitlisting is off", async () => {
    const { tx, rows } = makeTx({ capacity: 1, allowWaitlist: false }, [row("a1")]);
    await expect(claimSlot(tx, claim("b@x"))).rejects.toBeInstanceOf(SlotFullError);
    expect(rows).toHaveLength(1);
  });

  it("waitlisted rows don't count against capacity", async () => {
    const { tx } = makeTx({ capacity: 1, allowWaitlist: true }, [
      row("a1", { waitlisted: true }),
    ]);
    await expect(claimSlot(tx, claim("b@x"))).resolves.toEqual({ waitlisted: false });
  });

  it("one guardian can hold a seat for each of two scouts", async () => {
    const { tx, rows } = makeTx({ capacity: 5, allowWaitlist: true });
    await claimSlot(tx, { ...claim("p@x"), scoutName: "Alex P.", idempotent: true });
    await claimSlot(tx, { ...claim("p@x"), scoutName: "Sam P.", idempotent: true });
    expect(rows.map((r) => r.scoutName)).toEqual(["Alex P.", "Sam P."]);
  });

  it("idempotent: the same scout again returns the existing seat", async () => {
    const { tx, rows } = makeTx({ capacity: 1, allowWaitlist: true });
    await claimSlot(tx, { ...claim("p@x"), scoutName: "Alex P.", idempotent: true });
    const again = await claimSlot(tx, { ...claim("p@x"), scoutName: "Alex P.", idempotent: true });
    expect(again).toEqual({ waitlisted: false, existing: true });
    expect(rows).toHaveLength(1);
  });

  it("idempotent: a full no-waitlist slot still answers a repeat claim", async () => {
    const { tx } = makeTx({ capacity: 1, allowWaitlist: false }, [row("a1", { userId: "u1" })]);
    await expect(claimSlot(tx, { ...claim("x@x", "u1"), idempotent: true })).resolves.toEqual({
      waitlisted: false,
      existing: true,
    });
  });

  it("idempotent: a signed-in user adopts their earlier guest claim", async () => {
    const { tx, rows } = makeTx({ capacity: 1, allowWaitlist: true }, [row("a1")]);
    const r = await claimSlot(tx, { ...claim("a1@example.invalid", "u1"), idempotent: true });
    expect(r.existing).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("u1");
  });
});

describe("releaseSlot — waitlist promotion", () => {
  it("promotes the oldest waitlister when an active seat frees up", async () => {
    const { tx, rows } = makeTx({ capacity: 1, allowWaitlist: true }, [
      row("a1"),
      row("a3", { waitlisted: true }),
      row("a2", { waitlisted: true }),
    ]);
    const r = await releaseSlot(tx, { slotId: "s1", who: { guestEmail: "a1@example.invalid" } });
    expect(r).toEqual({ released: true, promotedIds: ["a2"] });
    expect(rows.find((x) => x.id === "a2")!.waitlisted).toBe(false);
    expect(rows.find((x) => x.id === "a3")!.waitlisted).toBe(true);
  });

  it("releasing a waitlisted row promotes nobody", async () => {
    const { tx } = makeTx({ capacity: 1, allowWaitlist: true }, [
      row("a1"),
      row("a2", { waitlisted: true }),
      row("a3", { waitlisted: true }),
    ]);
    const r = await releaseSlot(tx, { slotId: "s1", who: { guestEmail: "a3@example.invalid" } });
    expect(r).toEqual({ released: true, promotedIds: [] });
  });

  it("fills every open seat after a capacity increase", async () => {
    const { tx } = makeTx({ capacity: 3, allowWaitlist: true }, [
      row("a1"),
      row("a2", { waitlisted: true }),
      row("a3", { waitlisted: true }),
      row("a4", { waitlisted: true }),
    ]);
    const r = await releaseSlot(tx, { slotId: "s1", who: { guestEmail: "a1@example.invalid" } });
    expect(r.promotedIds).toEqual(["a2", "a3", "a4"]);
  });

  it("doesn't over-promote after a capacity decrease", async () => {
    const { tx } = makeTx({ capacity: 1, allowWaitlist: true }, [
      row("a1"),
      row("a2"),
      row("a3", { waitlisted: true }),
    ]);
    const r = await releaseSlot(tx, { slotId: "s1", who: { guestEmail: "a1@example.invalid" } });
    expect(r.promotedIds).toEqual([]);
  });

  it("a guest can't release a signed-in user's claim by typing their email", async () => {
    const { tx, rows } = makeTx({ capacity: 1, allowWaitlist: true }, [
      row("a1", { userId: "u1", email: "member@example.invalid" }),
    ]);
    const r = await releaseSlot(tx, {
      slotId: "s1",
      who: { guestEmail: "member@example.invalid" },
    });
    expect(r.released).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it("a signed-in user releases their own claim", async () => {
    const { tx, rows } = makeTx({ capacity: 1, allowWaitlist: true }, [
      row("a1", { userId: "u1" }),
    ]);
    const r = await releaseSlot(tx, { slotId: "s1", who: { userId: "u1" } });
    expect(r.released).toBe(true);
    expect(rows).toHaveLength(0);
  });
});
