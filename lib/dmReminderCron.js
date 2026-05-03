// DM email-reminder cron. Every ~5 minutes, find DM Messages older
// than 30 minutes whose recipient hasn't read them and we haven't yet
// emailed for, then send the "you have a message" nudge. Idempotent
// via Message.emailReminderSentAt — never re-fires for the same row.
//
// Pure helpers live in lib/chat.js (findUnreadDmRemindersDue,
// markDmReminderSent) so this module can stay thin and the matching
// logic is unit-testable without a mail driver.
//
// CRON_DISABLED=1 opts a process out, same as the newsletter cron —
// multi-pod deploys typically run only one cron driver.

import { findUnreadDmRemindersDue, markDmReminderSent } from "./chat.js";
import { logger as defaultLogger } from "./log.js";

function suppressedRecipient(member) {
  if (!member) return "no-member";
  if (!member.email) return "no-email";
  if (member.emailUnsubscribed) return "unsubscribed";
  if (member.bouncedAt) return "bounced";
  if (member.commPreference === "none") return "comm-pref-none";
  return null;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function reminderSubject(authorDisplayName, orgDisplayName) {
  return `New message from ${authorDisplayName || "someone"} in ${orgDisplayName}`;
}

function reminderBody({ authorDisplayName, orgDisplayName, snippet, deepLink }) {
  const name = authorDisplayName || "Someone";
  const text = `${name} sent you a message in ${orgDisplayName}.

${snippet}

Open ${orgDisplayName} to reply: ${deepLink}

You're receiving this because you haven't read the message yet. We won't email a second reminder.`;
  const html = `<p>${escapeHtml(name)} sent you a message in <strong>${escapeHtml(orgDisplayName)}</strong>.</p>
<blockquote style="border-left:3px solid #e2e8f0;padding-left:.75rem;color:#334155;margin:1rem 0">${escapeHtml(snippet)}</blockquote>
<p><a href="${escapeHtml(deepLink)}" style="background:#0f172a;color:#fff;padding:.5rem 1rem;border-radius:8px;text-decoration:none;display:inline-block">Open ${escapeHtml(orgDisplayName)}</a></p>
<p style="color:#64748b;font-size:.85rem">You're receiving this because you haven't read the message yet. We won't email a second reminder.</p>`;
  return { text, html };
}

/**
 * Run one sweep. Pure for tests — pass in your mail driver and clock.
 * Returns { sent, skipped } counts.
 */
export async function runDmReminderTick({
  prismaClient,
  sendMail,
  apexDomain = process.env.APEX_DOMAIN || "compass.app",
  protocol = process.env.NODE_ENV === "production" ? "https" : "http",
  port = process.env.PORT && process.env.NODE_ENV !== "production" ? `:${process.env.PORT}` : "",
  now = new Date(),
  logger = defaultLogger.child("dm-reminder"),
}) {
  if (!prismaClient || !sendMail) {
    throw new Error("runDmReminderTick: prismaClient + sendMail required");
  }
  const due = await findUnreadDmRemindersDue({ now, prismaClient });
  let sent = 0;
  let skipped = 0;

  for (const { message, recipientUserId, channel } of due) {
    // Resolve the recipient's directory entry to honor unsubscribe /
    // bounce / comm-preference. We match Member by email (the
    // recipient User's email lives on their User record).
    const user = await prismaClient.user.findUnique({
      where: { id: recipientUserId },
      select: { email: true },
    });
    if (!user?.email) {
      skipped++;
      continue;
    }
    const member = await prismaClient.member.findFirst({
      where: { orgId: channel.orgId, email: user.email },
      select: { email: true, emailUnsubscribed: true, bouncedAt: true, commPreference: true, status: true },
    });
    // No directory entry → still email the User's address. The Member
    // suppression flags only apply when there's a row to read them
    // from. We DO skip prospects/alumni: lead outreach has its own
    // surface; alumni opted out by leaving.
    if (member?.status && member.status !== "active") {
      skipped++;
      continue;
    }
    const suppression = suppressedRecipient(member);
    if (member && suppression) {
      logger.info("skip", { messageId: message.id, reason: suppression });
      skipped++;
      // Still stamp emailReminderSentAt so we don't re-evaluate this
      // message every tick forever.
      await markDmReminderSent(message.id, { now, prismaClient });
      continue;
    }

    const recipientEmail = member?.email || user.email;
    const orgSlug = channel.org?.slug;
    const orgDisplay = channel.org?.displayName || "Compass";
    const deepLink = `${protocol}://${orgSlug}.${apexDomain}${port}/chat`;
    const snippet = (message.body || "").slice(0, 200);

    const { text, html } = reminderBody({
      authorDisplayName: message.author?.displayName,
      orgDisplayName: orgDisplay,
      snippet,
      deepLink,
    });

    try {
      await sendMail({
        to: recipientEmail,
        subject: reminderSubject(message.author?.displayName, orgDisplay),
        text,
        html,
      });
      await markDmReminderSent(message.id, { now, prismaClient });
      sent++;
    } catch (err) {
      logger.warn("reminder send failed", { messageId: message.id, err: err && err.message });
      // Don't stamp — let the next tick retry. The cron is idempotent
      // either way, but a transient SMTP error shouldn't burn the
      // recipient's only reminder.
    }
  }

  return { sent, skipped };
}

/**
 * Start the interval loop. Returns a stop() function.
 */
export function startDmReminderLoop({
  prismaClient,
  sendMail,
  intervalMs = 5 * 60 * 1000,
  logger = defaultLogger.child("dm-reminder"),
} = {}) {
  if (process.env.CRON_DISABLED === "1") {
    logger.info("dm reminder loop disabled by env");
    return () => {};
  }
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const result = await runDmReminderTick({ prismaClient, sendMail, logger });
      if (result.sent || result.skipped) logger.info("tick", result);
    } catch (err) {
      logger.warn("tick failed", { err: err && err.message });
    }
  };
  setTimeout(tick, 10_000);
  const handle = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
