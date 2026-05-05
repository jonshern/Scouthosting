// DM email-reminder cron. Find DM Messages older than 30 minutes
// whose recipient hasn't read them and we haven't yet emailed for,
// then send the "you have a message" nudge. Idempotent via
// Message.emailReminderSentAt.
//
// Pure helpers (findUnreadDmRemindersDue, markDmReminderSent) live in
// src/lib/chat/index.ts so this module stays thin.

import type { PrismaClient } from "@prisma/client";
import { findUnreadDmRemindersDue, markDmReminderSent } from "./index";
import { logger as defaultLogger, type Logger } from "@/lib/log";
import { sendMail as defaultSendMail, type MailMessage, type MailResult } from "@/lib/mail";

type SuppressableMember = {
  email?: string | null;
  emailUnsubscribed?: boolean | null;
  bouncedAt?: Date | string | null;
  commPreference?: string | null;
  status?: string | null;
};

function suppressedRecipient(member: SuppressableMember | null | undefined): string | null {
  if (!member) return "no-member";
  if (!member.email) return "no-email";
  if (member.emailUnsubscribed) return "unsubscribed";
  if (member.bouncedAt) return "bounced";
  if (member.commPreference === "none") return "comm-pref-none";
  return null;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

function reminderSubject(authorDisplayName: string | undefined, orgDisplayName: string): string {
  return `New message from ${authorDisplayName || "someone"} in ${orgDisplayName}`;
}

function reminderBody(args: {
  authorDisplayName?: string;
  orgDisplayName: string;
  snippet: string;
  deepLink: string;
}): { text: string; html: string } {
  const name = args.authorDisplayName || "Someone";
  const text = `${name} sent you a message in ${args.orgDisplayName}.

${args.snippet}

Open ${args.orgDisplayName} to reply: ${args.deepLink}

You're receiving this because you haven't read the message yet. We won't email a second reminder.`;
  const html = `<p>${escapeHtml(name)} sent you a message in <strong>${escapeHtml(args.orgDisplayName)}</strong>.</p>
<blockquote style="border-left:3px solid #e2e8f0;padding-left:.75rem;color:#334155;margin:1rem 0">${escapeHtml(args.snippet)}</blockquote>
<p><a href="${escapeHtml(args.deepLink)}" style="background:#0f172a;color:#fff;padding:.5rem 1rem;border-radius:8px;text-decoration:none;display:inline-block">Open ${escapeHtml(args.orgDisplayName)}</a></p>
<p style="color:#64748b;font-size:.85rem">You're receiving this because you haven't read the message yet. We won't email a second reminder.</p>`;
  return { text, html };
}

type DmMessageLike = {
  id: string;
  body: string | null;
  author?: { displayName?: string | null } | null;
};
type DmChannelLike = {
  orgId: string;
  org?: { slug: string; displayName: string | null } | null;
};

/**
 * Run one sweep. Pure for tests — pass prismaClient + sendMail.
 */
export async function runDmReminderTick(args: {
  prismaClient: PrismaClient;
  sendMail?: (msg: MailMessage) => Promise<MailResult>;
  apexDomain?: string;
  protocol?: string;
  port?: string;
  now?: Date;
  logger?: Logger;
}): Promise<{ sent: number; skipped: number }> {
  const {
    prismaClient,
    sendMail = defaultSendMail,
    apexDomain = process.env.APEX_DOMAIN || "compass.app",
    protocol = process.env.NODE_ENV === "production" ? "https" : "http",
    port = process.env.PORT && process.env.NODE_ENV !== "production" ? `:${process.env.PORT}` : "",
    now = new Date(),
    logger = defaultLogger.child("dm-reminder"),
  } = args;

  if (!prismaClient || !sendMail) {
    throw new Error("runDmReminderTick: prismaClient + sendMail required");
  }
  const due = await findUnreadDmRemindersDue({ now, prismaClient });
  let sent = 0;
  let skipped = 0;

  for (const { message: msgUnknown, recipientUserId, channel: chanUnknown } of due) {
    const message = msgUnknown as DmMessageLike;
    const channel = chanUnknown as DmChannelLike;

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
      select: {
        email: true,
        emailUnsubscribed: true,
        bouncedAt: true,
        commPreference: true,
        status: true,
      },
    });
    if (member?.status && member.status !== "active") {
      skipped++;
      continue;
    }
    const suppression = suppressedRecipient(member);
    if (member && suppression) {
      logger.info("skip", { messageId: message.id, reason: suppression });
      skipped++;
      await markDmReminderSent(message.id, { now, prismaClient });
      continue;
    }

    const recipientEmail = member?.email || user.email;
    const orgSlug = channel.org?.slug ?? "";
    const orgDisplay = channel.org?.displayName || "Compass";
    const deepLink = `${protocol}://${orgSlug}.${apexDomain}${port}/chat`;
    const snippet = (message.body || "").slice(0, 200);

    const { text, html } = reminderBody({
      authorDisplayName: message.author?.displayName ?? undefined,
      orgDisplayName: orgDisplay,
      snippet,
      deepLink,
    });

    try {
      await sendMail({
        to: recipientEmail,
        subject: reminderSubject(message.author?.displayName ?? undefined, orgDisplay),
        text,
        html,
      });
      await markDmReminderSent(message.id, { now, prismaClient });
      sent++;
    } catch (err) {
      logger.warn("reminder send failed", {
        messageId: message.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { sent, skipped };
}
