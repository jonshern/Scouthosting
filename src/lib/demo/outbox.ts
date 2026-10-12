// In demo mode nothing leaves the building: the mail and SMS layers hand
// every message here instead of to Resend or Twilio, and /demo/outbox
// shows them so a visitor can see what their troop would have received.

import { prisma } from "@/lib/db";

export type OutboundKind = "email" | "sms";

export type Outbound = {
  kind: OutboundKind;
  to: string;
  toName?: string | null;
  subject?: string | null;
  body: string;
};

// Bodies are stored as plain text, trimmed so one huge newsletter can't
// fill the table; the outbox is a preview, not an archive.
const MAX_BODY = 20_000;
// The oldest rows go once the outbox passes this many.
const KEEP = 500;

export function plainText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export async function captureOutbound(msg: Outbound): Promise<string> {
  const row = await prisma.demoOutboxMessage.create({
    data: {
      kind: msg.kind,
      to: msg.to.slice(0, 320),
      toName: msg.toName?.slice(0, 200) ?? null,
      subject: msg.subject?.slice(0, 500) ?? null,
      body: msg.body.slice(0, MAX_BODY),
    },
    select: { id: true },
  });
  await trimOutbox();
  return `demo-${row.id}`;
}

async function trimOutbox(): Promise<void> {
  const cutoff = await prisma.demoOutboxMessage.findMany({
    orderBy: { createdAt: "desc" },
    skip: KEEP,
    take: 1,
    select: { createdAt: true },
  });
  if (cutoff[0]) {
    await prisma.demoOutboxMessage.deleteMany({ where: { createdAt: { lte: cutoff[0].createdAt } } });
  }
}

export async function recentOutbox(limit = 100) {
  return prisma.demoOutboxMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), KEEP),
  });
}
