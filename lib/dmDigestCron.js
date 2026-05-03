// Weekly DM digest cron. Long-tail backstop for messages that the
// 30-min email reminder didn't shake loose — sometimes the recipient
// genuinely didn't see the email either, or the message arrived
// during a vacation. A weekly recap surfaces what's still pending in
// one consolidated email, so nothing falls through indefinitely.
//
// Cadence: 7 days between digests per user, gated by
// User.lastDmDigestSentAt. We don't try to time it to "Sunday
// evening" precisely — the cron tick interval (default ~6h) means
// digests fan out across whatever moment a qualifying user crosses
// the 7-day threshold. Close enough; precise scheduling would need a
// real scheduler.
//
// Eligibility per user:
//   1. Has unread DMs older than 24h (anything fresher is still
//      reasonably "in flight" and the regular reminder cron handles).
//   2. lastDmDigestSentAt is null OR <= now - 7 days.
//   3. User has an email + the recipient Member (if any) is not
//      unsubscribed / bounced / commPref=none / status=prospect|alumni.

import { logger as defaultLogger } from "./log.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DIGEST_GRACE_MS = 7 * DAY_MS;
const FRESHNESS_FLOOR_MS = DAY_MS;
const MAX_DIGEST_BODY_ITEMS = 25;

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function suppressedRecipient(member) {
  if (!member) return null; // no Member row → don't suppress
  if (member.emailUnsubscribed) return "unsubscribed";
  if (member.bouncedAt) return "bounced";
  if (member.commPreference === "none") return "comm-pref-none";
  if (member.status && member.status !== "active") return `status-${member.status}`;
  return null;
}

/**
 * Build the per-user digest payload. Pure function — takes already-
 * loaded data structures and returns { subject, text, html, items }.
 * Callers handle the actual mail send.
 */
export function buildDigest({ recipientUser, items, apexDomain, protocol = "https", port = "" }) {
  const orgsTouched = new Set(items.map((i) => i.orgSlug));
  // If items span multiple orgs, the deep link points at the first
  // one's chat surface. Most recipients live in a single org so this
  // is fine in practice.
  const firstOrgSlug = items[0]?.orgSlug;
  const firstOrgName = items[0]?.orgDisplayName || "Compass";
  const deepLink = firstOrgSlug
    ? `${protocol}://${firstOrgSlug}.${apexDomain}${port}/chat`
    : `${protocol}://${apexDomain}${port}/`;

  const truncated = items.slice(0, MAX_DIGEST_BODY_ITEMS);
  const more = items.length - truncated.length;

  const lines = truncated.map((it) => {
    const ageDays = Math.max(1, Math.floor((Date.now() - new Date(it.createdAt).getTime()) / DAY_MS));
    const snippet = (it.body || "").slice(0, 140);
    return `• ${it.authorDisplayName || "Someone"} (${ageDays}d ago): ${snippet}`;
  });
  const moreLine = more > 0 ? `\n…and ${more} more.` : "";

  const text = `You have ${items.length} unread message${items.length === 1 ? "" : "s"} in ${
    orgsTouched.size === 1 ? firstOrgName : "Compass"
  }:

${lines.join("\n")}${moreLine}

Open ${firstOrgName} to read and reply: ${deepLink}

You're receiving this because at least one message has been waiting more than a day. We'll send another digest in a week if any are still unread.`;

  const htmlItems = truncated
    .map((it) => {
      const ageDays = Math.max(1, Math.floor((Date.now() - new Date(it.createdAt).getTime()) / DAY_MS));
      const snippet = (it.body || "").slice(0, 140);
      return `<li><strong>${escapeHtml(it.authorDisplayName || "Someone")}</strong> <span style="color:#64748b">(${ageDays}d ago)</span>: ${escapeHtml(snippet)}</li>`;
    })
    .join("");

  const html = `<p>You have <strong>${items.length}</strong> unread message${items.length === 1 ? "" : "s"} in ${escapeHtml(orgsTouched.size === 1 ? firstOrgName : "Compass")}.</p>
<ul>${htmlItems}</ul>
${more > 0 ? `<p style="color:#64748b">…and ${more} more.</p>` : ""}
<p><a href="${escapeHtml(deepLink)}" style="background:#0f172a;color:#fff;padding:.5rem 1rem;border-radius:8px;text-decoration:none;display:inline-block">Open ${escapeHtml(firstOrgName)}</a></p>
<p style="color:#64748b;font-size:.85rem">You're receiving this because at least one message has been waiting more than a day. We'll send another digest in a week if any are still unread.</p>`;

  const subject = `${items.length} unread message${items.length === 1 ? "" : "s"} in ${
    orgsTouched.size === 1 ? firstOrgName : "Compass"
  }`;

  return { subject, text, html };
}

/**
 * One sweep. Returns { digestsSent, recipientsSkipped }. The shape
 * mirrors lib/dmReminderCron.js so the cron loop can log uniformly.
 */
export async function runDmDigestTick({
  prismaClient,
  sendMail,
  apexDomain = process.env.APEX_DOMAIN || "compass.app",
  protocol = process.env.NODE_ENV === "production" ? "https" : "http",
  port = process.env.PORT && process.env.NODE_ENV !== "production" ? `:${process.env.PORT}` : "",
  now = new Date(),
  logger = defaultLogger.child("dm-digest"),
}) {
  if (!prismaClient || !sendMail) {
    throw new Error("runDmDigestTick: prismaClient + sendMail required");
  }
  const cutoffOld = new Date(now.getTime() - FRESHNESS_FLOOR_MS); // > 24h
  const cutoffDigest = new Date(now.getTime() - DIGEST_GRACE_MS); // > 7d ago

  // Find all unread-by-recipient DM messages older than 24h. Group by
  // recipient (the channel member that isn't the author). Each row
  // contributes one item to that recipient's digest.
  const olderUnread = await prismaClient.message.findMany({
    where: {
      createdAt: { lte: cutoffOld },
      deletedAt: null,
      channel: { kind: "dm" },
    },
    select: {
      id: true,
      authorId: true,
      body: true,
      createdAt: true,
      author: { select: { displayName: true } },
      channel: {
        select: {
          orgId: true,
          org: { select: { slug: true, displayName: true } },
          members: { select: { userId: true, lastReadAt: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Build per-recipient digest items
  const byRecipient = new Map(); // userId -> [items]
  for (const m of olderUnread) {
    const others = m.channel.members.filter((cm) => cm.userId !== m.authorId);
    for (const cm of others) {
      // Already-read filter: skip messages they've seen
      if (cm.lastReadAt && cm.lastReadAt >= m.createdAt) continue;
      const list = byRecipient.get(cm.userId) || [];
      list.push({
        id: m.id,
        authorDisplayName: m.author?.displayName,
        body: m.body,
        createdAt: m.createdAt,
        orgSlug: m.channel.org?.slug,
        orgDisplayName: m.channel.org?.displayName,
      });
      byRecipient.set(cm.userId, list);
    }
  }

  let digestsSent = 0;
  let recipientsSkipped = 0;

  for (const [recipientUserId, items] of byRecipient) {
    const user = await prismaClient.user.findUnique({
      where: { id: recipientUserId },
      select: { email: true, displayName: true, lastDmDigestSentAt: true },
    });
    if (!user?.email) {
      recipientsSkipped++;
      continue;
    }
    if (user.lastDmDigestSentAt && user.lastDmDigestSentAt > cutoffDigest) {
      recipientsSkipped++;
      continue; // digested too recently
    }

    // Suppression check via the most-relevant Member row. We pick any
    // Member with this email in any of the orgs the digest spans —
    // unsubscribe in one org effectively suppresses cross-org as
    // well, which is the conservative/safer default.
    const orgIds = [...new Set(items.map((i) => i.orgSlug).filter(Boolean))];
    const member = await prismaClient.member.findFirst({
      where: { email: user.email, org: { slug: { in: orgIds } } },
      select: { emailUnsubscribed: true, bouncedAt: true, commPreference: true, status: true },
    });
    const suppression = suppressedRecipient(member);
    if (suppression) {
      logger.info("skip digest", { recipientUserId, reason: suppression });
      recipientsSkipped++;
      // Stamp lastDmDigestSentAt so we don't re-evaluate every tick.
      await prismaClient.user.update({
        where: { id: recipientUserId },
        data: { lastDmDigestSentAt: now },
      });
      continue;
    }

    const { subject, text, html } = buildDigest({
      recipientUser: user,
      items,
      apexDomain,
      protocol,
      port,
    });

    try {
      await sendMail({ to: user.email, subject, text, html });
      await prismaClient.user.update({
        where: { id: recipientUserId },
        data: { lastDmDigestSentAt: now },
      });
      digestsSent++;
    } catch (err) {
      logger.warn("digest send failed", { recipientUserId, err: err && err.message });
      // Don't stamp — let next tick retry.
    }
  }

  return { digestsSent, recipientsSkipped };
}

/**
 * Start the loop. Returns stop(). Uses a 6-hour interval so any user
 * crossing the 7-day threshold gets digested within a quarter-day.
 * CRON_DISABLED=1 opts out (same gate as the other crons).
 */
export function startDmDigestLoop({
  prismaClient,
  sendMail,
  intervalMs = 6 * 60 * 60 * 1000,
  logger = defaultLogger.child("dm-digest"),
} = {}) {
  if (process.env.CRON_DISABLED === "1") {
    logger.info("dm digest loop disabled by env");
    return () => {};
  }
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const result = await runDmDigestTick({ prismaClient, sendMail, logger });
      if (result.digestsSent || result.recipientsSkipped) logger.info("tick", result);
    } catch (err) {
      logger.warn("tick failed", { err: err && err.message });
    }
  };
  setTimeout(tick, 60_000); // first run a minute after boot
  const handle = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
