import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { dueTrialReminder, runTrialReminderSweep } from "./trial-reminders";

vi.mock("@/lib/owner/signup-mail", () => ({ sendPlanReminder: vi.fn() }));

const NOW = new Date("2026-10-19T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

describe("dueTrialReminder", () => {
  it("picks the 7-day window, then the 1-day window, once each", () => {
    expect(dueTrialReminder(at(10), NOW, new Set())).toBeNull();
    expect(dueTrialReminder(at(6.5), NOW, new Set())).toBe(7);
    expect(dueTrialReminder(at(6.5), NOW, new Set([7]))).toBeNull();
    expect(dueTrialReminder(at(0.5), NOW, new Set([7]))).toBe(1);
    expect(dueTrialReminder(at(0.5), NOW, new Set([1]))).toBeNull();
    expect(dueTrialReminder(at(-1), NOW, new Set())).toBeNull();
  });
});

describe("runTrialReminderSweep", () => {
  const org = {
    id: "o1",
    slug: "troop9",
    customDomain: null,
    displayName: "Troop 9",
    trialEndsAt: at(5),
    owner: { id: "u1", email: "owner@example.invalid", displayName: "Pat" },
  };
  const fakePrisma = (sent: { orgId: string; action: string }[] = []) => {
    const create = vi.fn(async () => ({}));
    const findOrgs = vi.fn(async () => [org]);
    const db = {
      org: { findMany: findOrgs },
      auditLog: { findMany: vi.fn(async () => sent), create },
    } as unknown as PrismaClient;
    return { db, create, findOrgs };
  };

  it("does nothing while Stripe isn't set up", async () => {
    const { db, findOrgs } = fakePrisma();
    const send = vi.fn();
    expect(await runTrialReminderSweep({ prisma: db, stripeConfigured: false, now: NOW, send })).toEqual({ reminded: 0, failed: 0 });
    expect(findOrgs).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("emails the owner once per window and records it", async () => {
    const { db, create } = fakePrisma();
    const send = vi.fn(async () => ({ ok: true as const }));
    expect(await runTrialReminderSweep({ prisma: db, stripeConfigured: true, now: NOW, send })).toEqual({ reminded: 1, failed: 0 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ email: "owner@example.invalid", trialEndsAt: org.trialEndsAt }));
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ orgId: "o1", action: "trial:reminded:7" }) });

    const again = fakePrisma([{ orgId: "o1", action: "trial:reminded:7" }]);
    const send2 = vi.fn(async () => ({ ok: true as const }));
    await runTrialReminderSweep({ prisma: again.db, stripeConfigured: true, now: NOW, send: send2 });
    expect(send2).not.toHaveBeenCalled();
  });

  it("doesn't record a reminder whose email failed, so the next tick retries", async () => {
    const { db, create } = fakePrisma();
    const send = vi.fn(async () => ({ ok: false as const, error: "down" }));
    expect(await runTrialReminderSweep({ prisma: db, stripeConfigured: true, now: NOW, send })).toEqual({ reminded: 0, failed: 1 });
    expect(create).not.toHaveBeenCalled();
  });
});
