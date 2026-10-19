// Trial-end reminders. A unit on its free trial with no card on file
// gets an email to its owner 7 days and 1 day before the trial ends,
// with a link to Billing (the terms promise one). Runs from the hourly
// cron tick (lib/newsletter/cron.ts). Only when Stripe is set up: with
// no way to pay nothing locks, so there's nothing to remind about.
// Units that subscribed, are comped, suspended or demo are skipped.
// Renewal reminders for paying units are Stripe's own emails
// (docs/billing.md).
//
// Each reminder is an AuditLog row (action "trial:reminded:<days>"), so
// re-running is idempotent; a missed earlier window isn't backfilled.

import type { PrismaClient } from "@prisma/client";
import type { MailResult } from "@/lib/mail";
import { sendPlanReminder } from "@/lib/owner/signup-mail";

export const TRIAL_REMINDER_DAYS: ReadonlyArray<number> = [7, 1];
const DAY_MS = 24 * 60 * 60 * 1000;

/** The reminder window a trial ending at `trialEndsAt` is in now, or null. */
export function dueTrialReminder(trialEndsAt: Date, now: Date, alreadySent: Set<number>): number | null {
  const daysOut = (trialEndsAt.getTime() - now.getTime()) / DAY_MS;
  if (daysOut <= 0) return null;
  const window = [...TRIAL_REMINDER_DAYS].sort((a, b) => a - b).find((w) => daysOut <= w);
  if (window == null || alreadySent.has(window)) return null;
  return window;
}

type Send = typeof sendPlanReminder;

export async function runTrialReminderSweep(args: {
  prisma: PrismaClient;
  stripeConfigured: boolean;
  now?: Date;
  send?: Send;
}): Promise<{ reminded: number; failed: number }> {
  const { prisma, stripeConfigured, now = new Date(), send = sendPlanReminder } = args;
  if (!stripeConfigured) return { reminded: 0, failed: 0 };
  const horizon = new Date(now.getTime() + Math.max(...TRIAL_REMINDER_DAYS) * DAY_MS);
  const orgs = await prisma.org.findMany({
    where: {
      trialEndsAt: { gt: now, lte: horizon },
      stripeSubscriptionId: null,
      isDemo: false,
      suspendedAt: null,
      OR: [{ compedUntil: null }, { compedUntil: { lt: now } }],
      owner: { is: { disabledAt: null } },
    },
    select: {
      id: true,
      slug: true,
      customDomain: true,
      displayName: true,
      trialEndsAt: true,
      owner: { select: { id: true, email: true, displayName: true } },
    },
  });
  if (!orgs.length) return { reminded: 0, failed: 0 };

  const sent = await prisma.auditLog.findMany({
    where: { orgId: { in: orgs.map((o) => o.id) }, action: { startsWith: "trial:reminded:" } },
    select: { orgId: true, action: true },
  });
  const sentByOrg = new Map<string, Set<number>>();
  for (const r of sent) {
    if (!r.orgId) continue;
    const set = sentByOrg.get(r.orgId) ?? new Set<number>();
    set.add(Number(r.action.slice("trial:reminded:".length)));
    sentByOrg.set(r.orgId, set);
  }

  let reminded = 0;
  let failed = 0;
  for (const org of orgs) {
    if (!org.owner?.email || !org.trialEndsAt) continue;
    const window = dueTrialReminder(org.trialEndsAt, now, sentByOrg.get(org.id) ?? new Set());
    if (window == null) continue;
    const r: MailResult = await send({
      email: org.owner.email,
      name: org.owner.displayName,
      org: { slug: org.slug, customDomain: org.customDomain, displayName: org.displayName },
      trialEndsAt: org.trialEndsAt,
    });
    if (!r.ok) {
      failed++;
      continue;
    }
    reminded++;
    await prisma.auditLog.create({
      data: {
        orgId: org.id,
        userId: org.owner.id,
        entityType: "Org",
        entityId: org.id,
        action: `trial:reminded:${window}`,
        summary: `Trial-end reminder sent (${window} day${window === 1 ? "" : "s"} left)`,
      },
    });
  }
  return { reminded, failed };
}
