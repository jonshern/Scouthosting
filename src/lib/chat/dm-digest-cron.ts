// Weekly DM digest cron. Long-tail backstop for messages the 30-min
// reminder didn't shake loose. Cadence: 7 days between digests per
// user, gated by User.lastDmDigestSentAt.

import type { PrismaClient } from "@prisma/client";
import { logger as defaultLogger, type Logger } from "@/lib/log";
import { sendMail as defaultSendMail, type MailMessage, type MailResult } from "@/lib/mail";

const DAY_MS = 24 * 60 * 60 * 1000;
const DIGEST_GRACE_MS = 7 * DAY_MS;
const FRESHNESS_FLOOR_MS = DAY_MS;
const MAX_DIGEST_BODY_ITEMS = 25;

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

type SuppressableMember = {
  emailUnsubscribed?: boolean | null;
  bouncedAt?: Date | string | null;
  commPreference?: string | null;
  status?: string | null;
};

function suppressedRecipient(member: SuppressableMember | null): string | null {
  if (!member) return null;
  if (member.emailUnsubscribed) return "unsubscribed";
  if (member.bouncedAt) return "bounced";
  if (member.commPreference === "none") return "comm-pref-none";
  if (member.status && member.status !== "active") return `status-${member.status}`;
  return null;
}

export type DigestItem = {
  id: string;
  authorDisplayName?: string | null;
  body: string | null;
  createdAt: Date | string;
  orgSlug?: string | null;
  orgDisplayName?: string | null;
};

export function buildDigest(args: {
  items: DigestItem[];
  apexDomain: string;
  protocol?: string;
  port?: string;
}): { subject: string; text: string; html: string } {
  const { items, apexDomain, protocol = "https", port = "" } = args;
  const orgsTouched = new Set(items.map((i) => i.orgSlug));
  const firstOrgSlug = items[0]?.orgSlug;
  const firstOrgName = items[0]?.orgDisplayName || "Compass";
  const deepLink = firstOrgSlug
    ? `${protocol}://${firstOrgSlug}.${apexDomain}${port}/chat`
    : `${protocol}://${apexDomain}${port}/`;

  const truncated = items.slice(0, MAX_DIGEST_BODY_ITEMS);
  const more = items.length - truncated.length;
  const lines = truncated.map((it) => {
    const ageDays = Math.max(
      1,
      Math.floor((Date.now() - new Date(it.createdAt).getTime()) / DAY_MS),
    );
    const snippet = (it.body || "").slice(0, 140);
    return `• ${it.authorDisplayName || "Someone"} (${ageDays}d ago): ${snippet}`;
  });
  const moreLine = more > 0 ? `\n…and ${more} more.` : "";

  const subject = `${items.length} unread message${items.length === 1 ? "" : "s"} in ${
    orgsTouched.size === 1 ? firstOrgName : "Compass"
  }`;
  const text = `You have ${items.length} unread message${items.length === 1 ? "" : "s"} in ${
    orgsTouched.size === 1 ? firstOrgName : "Compass"
  }:

${lines.join("\n")}${moreLine}

Open ${firstOrgName} to read and reply: ${deepLink}

You're receiving this because at least one message has been waiting more than a day. We'll send another digest in a week if any are still unread.`;

  const htmlItems = truncated
    .map((it) => {
      const ageDays = Math.max(
        1,
        Math.floor((Date.now() - new Date(it.createdAt).getTime()) / DAY_MS),
      );
      const snippet = (it.body || "").slice(0, 140);
      return `<li><strong>${escapeHtml(it.authorDisplayName || "Someone")}</strong> <span style="color:#64748b">(${ageDays}d ago)</span>: ${escapeHtml(snippet)}</li>`;
    })
    .join("");
  const html = `<p>You have <strong>${items.length}</strong> unread message${items.length === 1 ? "" : "s"} in ${escapeHtml(orgsTouched.size === 1 ? firstOrgName : "Compass")}.</p>
<ul>${htmlItems}</ul>
${more > 0 ? `<p style="color:#64748b">…and ${more} more.</p>` : ""}
<p><a href="${escapeHtml(deepLink)}" style="background:#0f172a;color:#fff;padding:.5rem 1rem;border-radius:8px;text-decoration:none;display:inline-block">Open ${escapeHtml(firstOrgName)}</a></p>
<p style="color:#64748b;font-size:.85rem">You're receiving this because at least one message has been waiting more than a day. We'll send another digest in a week if any are still unread.</p>`;

  return { subject, text, html };
}

export async function runDmDigestTick(args: {
  prismaClient: PrismaClient;
  sendMail?: (msg: MailMessage) => Promise<MailResult>;
  apexDomain?: string;
  protocol?: string;
  port?: string;
  now?: Date;
  logger?: Logger;
}): Promise<{ digestsSent: number; recipientsSkipped: number }> {
  const {
    prismaClient,
    sendMail = defaultSendMail,
    apexDomain = process.env.APEX_DOMAIN || "compass.app",
    protocol = process.env.NODE_ENV === "production" ? "https" : "http",
    port = process.env.PORT && process.env.NODE_ENV !== "production" ? `:${process.env.PORT}` : "",
    now = new Date(),
    logger = defaultLogger.child("dm-digest"),
  } = args;
  if (!prismaClient || !sendMail) {
    throw new Error("runDmDigestTick: prismaClient + sendMail required");
  }
  const cutoffOld = new Date(now.getTime() - FRESHNESS_FLOOR_MS);
  const cutoffDigest = new Date(now.getTime() - DIGEST_GRACE_MS);

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

  const byRecipient = new Map<string, DigestItem[]>();
  for (const m of olderUnread) {
    const others = m.channel.members.filter((cm) => cm.userId !== m.authorId);
    for (const cm of others) {
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
      continue;
    }
    const orgSlugs = [...new Set(items.map((i) => i.orgSlug).filter((s): s is string => !!s))];
    const member = await prismaClient.member.findFirst({
      where: { email: user.email, org: { slug: { in: orgSlugs } } },
      select: {
        emailUnsubscribed: true,
        bouncedAt: true,
        commPreference: true,
        status: true,
      },
    });
    const suppression = suppressedRecipient(member);
    if (suppression) {
      logger.info("skip digest", { recipientUserId, reason: suppression });
      recipientsSkipped++;
      await prismaClient.user.update({
        where: { id: recipientUserId },
        data: { lastDmDigestSentAt: now },
      });
      continue;
    }

    const { subject, text, html } = buildDigest({ items, apexDomain, protocol, port });
    try {
      await sendMail({ to: user.email, subject, text, html });
      await prismaClient.user.update({
        where: { id: recipientUserId },
        data: { lastDmDigestSentAt: now },
      });
      digestsSent++;
    } catch (err) {
      logger.warn("digest send failed", {
        recipientUserId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { digestsSent, recipientsSkipped };
}
