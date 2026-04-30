// Unit tests for lib/loanReminders.js. The helper accepts injected
// `prismaClient` and `sender` overrides, so we never touch a real DB or
// mail driver — the tests build small in-memory stand-ins.

import { describe, it, expect, beforeEach } from "vitest";
import { sendOverdueReminders, _internal } from "../lib/loanReminders.js";

function fakePrisma(loans) {
  // The helper calls findMany with `where.dueAt: { lt: now, not: null }`
  // and `returnedAt: null`. We honor those filters so tests can pre-seed
  // a mix of overdue / future / returned loans without being clever.
  const updateCalls = [];
  return {
    equipmentLoan: {
      findMany: async ({ where }) => {
        const now = where.dueAt?.lt;
        return loans.filter((l) => {
          if (l.orgId !== where.orgId) return false;
          if (l.returnedAt) return false;
          if (!l.dueAt) return false;
          if (now && new Date(l.dueAt) >= now) return false;
          return true;
        });
      },
      updateMany: async (args) => {
        updateCalls.push(args);
        for (const id of args.where.id.in) {
          const loan = loans.find((l) => l.id === id);
          if (loan) loan.lastReminderAt = args.data.lastReminderAt;
        }
        return { count: args.where.id.in.length };
      },
    },
    auditLog: { create: async () => null },
    _updateCalls: updateCalls,
  };
}

function fakeSender(behavior = {}) {
  const calls = [];
  return {
    fn: async (messages) => {
      calls.push(messages);
      const errors = [];
      for (const m of messages) {
        if (behavior.failFor?.includes(m.to)) {
          errors.push({ to: m.to, error: "simulated failure" });
        }
      }
      return { sent: messages.length - errors.length, errors };
    },
    calls,
  };
}

const ORG = { id: "org1", displayName: "Test Troop", slug: "testtroop" };
const NOW = new Date("2026-04-30T12:00:00Z");
const PAST = new Date("2026-04-25T12:00:00Z");
const FUTURE = new Date("2026-05-05T12:00:00Z");

function loan(overrides = {}) {
  return {
    id: "L1",
    orgId: ORG.id,
    equipment: { id: "E1", name: "2-burner stove" },
    borrowerName: "Mason Park",
    borrowerEmail: "mason@example.invalid",
    member: null,
    dueAt: PAST,
    returnedAt: null,
    lastReminderAt: null,
    checkedOutAt: PAST,
    ...overrides,
  };
}

describe("sendOverdueReminders", () => {
  beforeEach(() => {
    delete process.env.APEX_DOMAIN;
  });

  it("emails every overdue borrower and stamps lastReminderAt", async () => {
    const loans = [loan({ id: "L1" }), loan({ id: "L2", borrowerEmail: "two@example.invalid" })];
    const prisma = fakePrisma(loans);
    const sender = fakeSender();

    const r = await sendOverdueReminders({
      org: ORG,
      now: NOW,
      prismaClient: prisma,
      sender: sender.fn,
    });

    expect(r.total).toBe(2);
    expect(r.sent).toEqual([
      { loanId: "L1", to: "mason@example.invalid" },
      { loanId: "L2", to: "two@example.invalid" },
    ]);
    expect(r.skipped).toEqual([]);
    expect(r.throttled).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(loans[0].lastReminderAt).toBe(NOW);
    expect(loans[1].lastReminderAt).toBe(NOW);
  });

  it("ignores loans that aren't overdue", async () => {
    const loans = [
      loan({ id: "L1", dueAt: FUTURE }), // not yet due
      loan({ id: "L2", dueAt: null }),    // open-ended
      loan({ id: "L3" }),                 // overdue — should fire
    ];
    const prisma = fakePrisma(loans);
    const sender = fakeSender();

    const r = await sendOverdueReminders({
      org: ORG,
      now: NOW,
      prismaClient: prisma,
      sender: sender.fn,
    });

    expect(r.total).toBe(1);
    expect(r.sent.map((s) => s.loanId)).toEqual(["L3"]);
  });

  it("ignores already-returned loans", async () => {
    const loans = [
      loan({ id: "L1", returnedAt: NOW }),
      loan({ id: "L2" }),
    ];
    const prisma = fakePrisma(loans);
    const sender = fakeSender();
    const r = await sendOverdueReminders({ org: ORG, now: NOW, prismaClient: prisma, sender: sender.fn });
    expect(r.total).toBe(1);
    expect(r.sent.map((s) => s.loanId)).toEqual(["L2"]);
  });

  it("throttles loans that were nudged in the last 24h", async () => {
    const justNow = new Date(NOW.getTime() - 60 * 60 * 1000); // 1h ago
    const longAgo = new Date(NOW.getTime() - 48 * 60 * 60 * 1000); // 2d ago
    const loans = [
      loan({ id: "fresh", lastReminderAt: justNow }),
      loan({ id: "stale", lastReminderAt: longAgo, borrowerEmail: "stale@example.invalid" }),
    ];
    const prisma = fakePrisma(loans);
    const sender = fakeSender();

    const r = await sendOverdueReminders({ org: ORG, now: NOW, prismaClient: prisma, sender: sender.fn });

    expect(r.throttled).toEqual([{ loanId: "fresh" }]);
    expect(r.sent.map((s) => s.loanId)).toEqual(["stale"]);
  });

  it("prefers the linked Member's email when available", async () => {
    const loans = [
      loan({
        id: "L1",
        borrowerEmail: "fallback@example.invalid",
        member: { email: "member@example.invalid", commPreference: "email" },
      }),
    ];
    const prisma = fakePrisma(loans);
    const sender = fakeSender();
    const r = await sendOverdueReminders({ org: ORG, now: NOW, prismaClient: prisma, sender: sender.fn });
    expect(r.sent[0].to).toBe("member@example.invalid");
  });

  it("respects commPreference=none and falls back to borrowerEmail", async () => {
    const loans = [
      loan({
        id: "L1",
        borrowerEmail: "borrower@example.invalid",
        member: { email: "member@example.invalid", commPreference: "none" },
      }),
    ];
    const prisma = fakePrisma(loans);
    const sender = fakeSender();
    const r = await sendOverdueReminders({ org: ORG, now: NOW, prismaClient: prisma, sender: sender.fn });
    expect(r.sent[0].to).toBe("borrower@example.invalid");
  });

  it("skips loans with no resolvable email", async () => {
    const loans = [
      loan({
        id: "L1",
        borrowerEmail: null,
        member: null,
        borrowerName: "Walk-in parent",
      }),
    ];
    const prisma = fakePrisma(loans);
    const sender = fakeSender();
    const r = await sendOverdueReminders({ org: ORG, now: NOW, prismaClient: prisma, sender: sender.fn });
    expect(r.sent).toEqual([]);
    expect(r.skipped).toEqual([
      { loanId: "L1", reason: "no email on file", borrowerName: "Walk-in parent" },
    ]);
    // No email was attempted, so nothing should have been written to the
    // throttle column either.
    expect(loans[0].lastReminderAt).toBeNull();
  });

  it("reports per-loan errors and does not stamp the failed ones", async () => {
    const loans = [
      loan({ id: "ok", borrowerEmail: "ok@example.invalid" }),
      loan({ id: "bad", borrowerEmail: "bad@example.invalid" }),
    ];
    const prisma = fakePrisma(loans);
    const sender = fakeSender({ failFor: ["bad@example.invalid"] });

    const r = await sendOverdueReminders({ org: ORG, now: NOW, prismaClient: prisma, sender: sender.fn });

    expect(r.sent.map((s) => s.loanId)).toEqual(["ok"]);
    expect(r.errors).toEqual([{ loanId: "bad", error: "simulated failure" }]);
    expect(loans.find((l) => l.id === "ok").lastReminderAt).toBe(NOW);
    expect(loans.find((l) => l.id === "bad").lastReminderAt).toBeNull();
  });

  it("returns empty result with no DB write when nothing is overdue", async () => {
    const prisma = fakePrisma([]);
    const sender = fakeSender();
    const r = await sendOverdueReminders({ org: ORG, now: NOW, prismaClient: prisma, sender: sender.fn });
    expect(r).toEqual({
      total: 0, sent: [], skipped: [], throttled: [], errors: [],
    });
    expect(prisma._updateCalls).toEqual([]);
    expect(sender.calls).toEqual([]);
  });

  it("requires an org with an id", async () => {
    await expect(sendOverdueReminders({})).rejects.toThrow(/missing org/);
  });
});

describe("buildEmail (internal)", () => {
  it("uses the organization's display name in the subject", () => {
    const out = _internal.buildEmail({
      org: { displayName: "Troop 12" },
      loan: {
        borrowerName: "Mason Park",
        equipment: { name: "2-burner stove" },
        dueAt: PAST,
      },
      apexUrl: "https://troop12.compass.app",
    });
    expect(out.subject).toBe("[Troop 12] Reminder: please return 2-burner stove");
    expect(out.text).toContain("Mason Park");
    expect(out.html).toContain("2-burner stove");
  });

  it("escapes HTML metacharacters in borrower / item names", () => {
    const out = _internal.buildEmail({
      org: { displayName: "Troop 12" },
      loan: {
        borrowerName: "<script>",
        equipment: { name: "tent & poles" },
        dueAt: PAST,
      },
      apexUrl: "https://troop12.compass.app",
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).toContain("tent &amp; poles");
  });
});
