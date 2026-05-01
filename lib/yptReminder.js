// YPT (Youth Protection Training) expiration reminders.
//
// The chat two-deep gate is the hard guardrail — a channel auto-
// suspends the moment its second adult drops below current. That's
// painful by design; this module is the soft, friendly side. We
// periodically scan OrgMembership for leaders whose YPT expires soon
// and remind them so it never gets to the auto-suspend.
//
// Reminder windows: 60 days, 30 days, 7 days. We track which window a
// given leader has already been reminded for via AuditLog rows
// (action="ypt:reminded:<window>") so re-running the sweep is
// idempotent.

import { logger } from "./log.js";
import { sendBatch as sendMailBatch } from "./mail.js";

const log = logger.child("ypt-reminder");

export const REMINDER_WINDOWS = Object.freeze([60, 30, 7]);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure function that decides which reminder window is due for an
 * OrgMembership row right now. Returns an array of at most one
 * window-day number — the smallest window the row is currently inside
 * that hasn't already been reminded for. Larger (earlier) windows
 * that were missed don't backfill: at 5 days out, sending a "60-day
 * heads up" is stale and noisy, just send the 7-day.
 *
 * `alreadyReminded` is the set of window-days previous sweeps fired
 * for this user; this function never re-fires those.
 */
export function dueWindows({ yptCurrentUntil, now = new Date(), alreadyReminded = new Set() }) {
  if (!yptCurrentUntil) return [];
  const expiresMs = new Date(yptCurrentUntil).getTime();
  if (expiresMs < now.getTime()) return []; // already expired — auto-suspend handles it
  const daysOut = (expiresMs - now.getTime()) / DAY_MS;
  // Find the smallest window the leader is currently inside (the
  // "active" window for this point in the lead-up). If we've already
  // fired that exact window, no reminder — never fall back to a
  // larger window that's now stale.
  const ascending = REMINDER_WINDOWS.slice().sort((a, b) => a - b);
  const active = ascending.find((w) => daysOut <= w);
  if (!active) return [];
  if (alreadyReminded.has(active)) return [];
  return [active];
}

/**
 * Sweep an org's leader memberships and fire reminder emails for any
 * window that's freshly due. Idempotent — pre-existing AuditLog
 * "ypt:reminded:<window>" rows mark already-fired reminders.
 *
 * Returns: { reminded: number, errors: Array }
 */
export async function runYptReminderSweep({ prisma, org, now = new Date(), mailer = sendMailBatch }) {
  const memberships = await prisma.orgMembership.findMany({
    where: {
      orgId: org.id,
      role: { in: ["leader", "admin"] },
      yptCurrentUntil: { gt: now },
    },
    include: { user: { select: { id: true, email: true, displayName: true } } },
  });
  if (!memberships.length) return { reminded: 0, errors: [] };

  // Pre-load the existing reminder rows in one query.
  const userIds = memberships.map((m) => m.userId);
  const reminderRows = await prisma.auditLog.findMany({
    where: {
      orgId: org.id,
      userId: { in: userIds },
      action: { startsWith: "ypt:reminded:" },
    },
    select: { userId: true, action: true },
  });
  const remindedByUser = new Map();
  for (const r of reminderRows) {
    let set = remindedByUser.get(r.userId);
    if (!set) {
      set = new Set();
      remindedByUser.set(r.userId, set);
    }
    const w = Number(r.action.replace("ypt:reminded:", ""));
    if (!isNaN(w)) set.add(w);
  }

  const messages = [];
  const tasks = [];
  for (const m of memberships) {
    const due = dueWindows({
      yptCurrentUntil: m.yptCurrentUntil,
      now,
      alreadyReminded: remindedByUser.get(m.userId) || new Set(),
    });
    for (const window of due) {
      const expires = new Date(m.yptCurrentUntil);
      const subject = window === 7
        ? `Your YPT training expires in ${window} days`
        : `Heads up — YPT renewal coming up in ${window} days`;
      const text = [
        `Hi ${m.user.displayName},`,
        "",
        `Your Youth Protection Training expires on ${expires.toISOString().slice(0, 10)} — about ${window} days from today.`,
        "",
        `Renew at https://my.scouting.org and update the date in ${org.displayName}'s admin under Roster → Training so the system stays in sync.`,
        "",
        "If your training lapses, any chat channel where you're the second adult will auto-suspend until two YPT-current adults are members again. We're sending this nudge so it never gets there.",
        "",
        "— Compass",
      ].join("\n");
      messages.push({
        to: m.user.email,
        subject,
        text,
        from: `Compass <noreply@${process.env.APEX_DOMAIN || "compass.app"}>`,
      });
      tasks.push({ userId: m.userId, window });
    }
  }
  if (!messages.length) return { reminded: 0, errors: [] };

  const result = await mailer(messages);
  // Record the reminders we actually sent so the next sweep doesn't
  // duplicate. We optimistically mark all tasks; failures are rare
  // and a duplicate reminder is a smaller cost than a missed one.
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
  log.info("YPT reminder sweep", { orgId: org.id, sent: result.sent, errors: result.errors.length });
  return { reminded: result.sent, errors: result.errors };
}
