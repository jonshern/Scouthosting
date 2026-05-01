// YPT-reminder tests.

import { describe, it, expect, vi } from "vitest";
import { dueWindows, REMINDER_WINDOWS, runYptReminderSweep } from "../lib/yptReminder.js";

const NOW = new Date("2026-05-01T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("dueWindows", () => {
  it("returns [] when yptCurrentUntil is missing", () => {
    expect(dueWindows({ yptCurrentUntil: null, now: NOW })).toEqual([]);
  });

  it("returns [] when training is already expired (auto-suspend handles it)", () => {
    const expired = new Date(NOW.getTime() - 1 * DAY);
    expect(dueWindows({ yptCurrentUntil: expired, now: NOW })).toEqual([]);
  });

  it("fires the 7-day window when 5 days away", () => {
    const exp = new Date(NOW.getTime() + 5 * DAY);
    expect(dueWindows({ yptCurrentUntil: exp, now: NOW })).toEqual([7]);
  });

  it("fires the 30-day window when 25 days away", () => {
    const exp = new Date(NOW.getTime() + 25 * DAY);
    expect(dueWindows({ yptCurrentUntil: exp, now: NOW })).toEqual([30]);
  });

  it("fires the 60-day window when 50 days away", () => {
    const exp = new Date(NOW.getTime() + 50 * DAY);
    expect(dueWindows({ yptCurrentUntil: exp, now: NOW })).toEqual([60]);
  });

  it("returns at most one window per call (no backfilling stale reminders)", () => {
    const exp = new Date(NOW.getTime() + 5 * DAY);
    const result = dueWindows({ yptCurrentUntil: exp, now: NOW });
    expect(result.length).toBeLessThanOrEqual(1);
    expect(result).toEqual([7]);
  });

  it("skips a window that's already been sent", () => {
    const exp = new Date(NOW.getTime() + 5 * DAY);
    expect(
      dueWindows({ yptCurrentUntil: exp, now: NOW, alreadyReminded: new Set([7]) }),
    ).toEqual([]);
  });

  it("returns [] when training is far enough out (>60 days)", () => {
    const exp = new Date(NOW.getTime() + 90 * DAY);
    expect(dueWindows({ yptCurrentUntil: exp, now: NOW })).toEqual([]);
  });

  it("REMINDER_WINDOWS is frozen + descending", () => {
    expect(Object.isFrozen(REMINDER_WINDOWS)).toBe(true);
    for (let i = 1; i < REMINDER_WINDOWS.length; i++) {
      expect(REMINDER_WINDOWS[i]).toBeLessThan(REMINDER_WINDOWS[i - 1]);
    }
  });
});

describe("runYptReminderSweep", () => {
  function fakePrisma({ memberships = [], existingReminderRows = [] }) {
    const audit = [...existingReminderRows];
    return {
      _audit: audit,
      orgMembership: {
        findMany: async () => memberships,
      },
      auditLog: {
        findMany: async () => audit.filter((r) => r.action.startsWith("ypt:reminded:")),
        createMany: async ({ data }) => {
          for (const row of data) audit.push(row);
          return { count: data.length };
        },
      },
    };
  }

  it("sends one reminder for the smallest due window per leader", async () => {
    const exp = new Date(NOW.getTime() + 5 * DAY); // 7-day window
    const memberships = [
      {
        userId: "u1",
        yptCurrentUntil: exp,
        user: { id: "u1", email: "leader@example.com", displayName: "Sam" },
      },
    ];
    const prisma = fakePrisma({ memberships });
    const mailer = vi.fn().mockResolvedValue({ sent: 1, errors: [] });
    const result = await runYptReminderSweep({
      prisma,
      org: { id: "o1", displayName: "Troop 12" },
      now: NOW,
      mailer,
    });
    expect(result.reminded).toBe(1);
    const sentMessages = mailer.mock.calls[0][0];
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].to).toBe("leader@example.com");
    expect(sentMessages[0].subject).toMatch(/7 days/);
    // One AuditLog row recorded so the next sweep is idempotent.
    expect(prisma._audit.filter((r) => r.action === "ypt:reminded:7").length).toBe(1);
  });

  it("skips a leader whose smallest-applicable window is already recorded (idempotent)", async () => {
    const exp = new Date(NOW.getTime() + 5 * DAY);
    const prisma = fakePrisma({
      memberships: [{
        userId: "u1",
        yptCurrentUntil: exp,
        user: { id: "u1", email: "leader@example.com", displayName: "Sam" },
      }],
      existingReminderRows: [{ userId: "u1", action: "ypt:reminded:7" }],
    });
    const mailer = vi.fn().mockResolvedValue({ sent: 0, errors: [] });
    const result = await runYptReminderSweep({
      prisma,
      org: { id: "o1", displayName: "Troop 12" },
      now: NOW,
      mailer,
    });
    expect(result.reminded).toBe(0);
    expect(mailer).not.toHaveBeenCalled();
  });

  it("no-ops when no leaders are inside any reminder window", async () => {
    const farOut = new Date(NOW.getTime() + 365 * DAY);
    const prisma = fakePrisma({
      memberships: [{
        userId: "u1",
        yptCurrentUntil: farOut,
        user: { id: "u1", email: "leader@example.com", displayName: "Sam" },
      }],
    });
    const mailer = vi.fn().mockResolvedValue({ sent: 0, errors: [] });
    const result = await runYptReminderSweep({
      prisma,
      org: { id: "o1", displayName: "Troop 12" },
      now: NOW,
      mailer,
    });
    expect(result.reminded).toBe(0);
    expect(mailer).not.toHaveBeenCalled();
  });

  it("no-ops when org has no leaders to scan", async () => {
    const prisma = fakePrisma({});
    const mailer = vi.fn();
    const result = await runYptReminderSweep({
      prisma,
      org: { id: "o1", displayName: "Troop 12" },
      now: NOW,
      mailer,
    });
    expect(result.reminded).toBe(0);
    expect(mailer).not.toHaveBeenCalled();
  });
});
