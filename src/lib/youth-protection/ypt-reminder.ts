// YPT (Youth Protection Training) expiration reminders.
//
// The chat two-deep gate is the hard guardrail — a channel auto-
// suspends the moment its second adult drops below YPT-current. This
// module is the soft, friendly side: periodically scan
// OrgMembership for leaders whose YPT expires soon and remind them
// before it gets to auto-suspend.
//
// Reminder windows: 60 days, 30 days, 7 days. Tracked via AuditLog
// rows (action="ypt:reminded:<window>") so re-running is idempotent.

import type { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/log";
import { sendMail, type MailMessage, type MailResult } from "@/lib/mail";

const log = logger.child("ypt-reminder");

export const REMINDER_WINDOWS: ReadonlyArray<number> = [60, 30, 7];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure function. Decides which reminder window is currently active
 * for a single OrgMembership row. Returns at most one window-day
 * number — the smallest window this row is inside that hasn't already
 * been reminded for. Larger / earlier missed windows don't backfill.
 */
export function dueWindows({
  yptCurrentUntil,
  now = new Date(),
  alreadyReminded = new Set<number>(),
}: {
  yptCurrentUntil: Date | string | null | undefined;
  now?: Date;
  alreadyReminded?: Set<number>;
}): number[] {
  if (!yptCurrentUntil) return [];
  const expiresMs = new Date(yptCurrentUntil).getTime();
  if (expiresMs < now.getTime()) return []; // already expired — chat suspend handles it
  const daysOut = (expiresMs - now.getTime()) / DAY_MS;
  const ascending = REMINDER_WINDOWS.slice().sort((a, b) => a - b);
  const active = ascending.find((w) => daysOut <= w);
  if (active == null) return [];
  if (alreadyReminded.has(active)) return [];
  return [active];
}

export type SweepResult = {
  reminded: number;
  errors: Array<{ to: string; error: string }>;
};

export type Mailer = (
  messages: MailMessage[],
) => Promise<{ sent: number; errors: Array<{ to: string; error: string }> }>;

const defaultMailer: Mailer = async (messages) => {
  let sent = 0;
  const errors: Array<{ to: string; error: string }> = [];
  for (const m of messages) {
    const r: MailResult = await sendMail(m);
    if (r.ok) sent++;
    else errors.push({ to: m.to, error: r.error });
  }
  return { sent, errors };
};

/**
 * Sweep an org's leader memberships and fire reminder emails for any
 * window that's freshly due. Idempotent — pre-existing AuditLog
 * "ypt:reminded:<window>" rows mark already-fired reminders.
 */
export async function runYptReminderSweep(args: {
  prisma: PrismaClient;
  org: { id: string; displayName: string };
  now?: Date;
  mailer?: Mailer;
}): Promise<SweepResult> {
  const { prisma, org, now = new Date(), mailer = defaultMailer } = args;
  const memberships = await prisma.orgMembership.findMany({
    where: {
      orgId: org.id,
      role: { in: ["leader", "admin"] },
      yptCurrentUntil: { gt: now },
    },
    include: { user: { select: { id: true, email: true, displayName: true } } },
  });
  if (!memberships.length) return { reminded: 0, errors: [] };

  const userIds = memberships.map((m) => m.userId);
  const reminderRows = await prisma.auditLog.findMany({
    where: {
      orgId: org.id,
      userId: { in: userIds },
      action: { startsWith: "ypt:reminded:" },
    },
    select: { userId: true, action: true },
  });
  const remindedByUser = new Map<string, Set<number>>();
  for (const r of reminderRows) {
    if (!r.userId) continue;
    let set = remindedByUser.get(r.userId);
    if (!set) {
      set = new Set();
      remindedByUser.set(r.userId, set);
    }
    const w = Number(r.action.replace("ypt:reminded:", ""));
    if (!Number.isNaN(w)) set.add(w);
  }

  const messages: MailMessage[] = [];
  const tasks: Array<{ userId: string; window: number }> = [];
  for (const m of memberships) {
    const due = dueWindows({
      yptCurrentUntil: m.yptCurrentUntil,
      now,
      alreadyReminded: remindedByUser.get(m.userId) || new Set(),
    });
    for (const window of due) {
      const expires = new Date(m.yptCurrentUntil!);
      const subject =
        window === 7
          ? `Your YPT training expires in ${window} days`
          : `Heads up — YPT renewal coming up in ${window} days`;
      const text = [
        `Hi ${m.user.displayName},`,
        "",
        `Your Youth Protection Training expires on ${expires
          .toISOString()
          .slice(0, 10)} — about ${window} days from today.`,
        "",
        `Renew at https://my.scouting.org and update the date in ${org.displayName}'s admin under Roster → Training so the system stays in sync.`,
        "",
        "If your training lapses, any chat channel where you're the second adult will auto-suspend until two YPT-current adults are members again. We're sending this nudge so it never gets there.",
        "",
        "— Compass",
      ].join("\n");
      messages.push({
        to: m.user.email!,
        subject,
        html: `<pre style="font-family:sans-serif">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
        text,
      });
      tasks.push({ userId: m.userId, window });
    }
  }
  if (!messages.length) return { reminded: 0, errors: [] };

  const result = await mailer(messages);
  await prisma.auditLog.createMany({
    data: tasks.map((t) => ({
      orgId: org.id,
      userId: t.userId,
      entityType: "OrgMembership",
      action: `ypt:reminded:${t.window}`,
      summary: `YPT reminder sent (${t.window}-day window)`,
    })),
    skipDuplicates: true,
  });
  log.info("YPT reminder sweep", {
    orgId: org.id,
    sent: result.sent,
    errors: result.errors.length,
  });
  return { reminded: result.sent, errors: result.errors };
}
