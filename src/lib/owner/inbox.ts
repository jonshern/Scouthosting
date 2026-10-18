// Questions and feedback for the owner console inbox. They arrive from
// the apps' "Send feedback" screens (POST /api/v1/feedback), the
// Compass app's "Contact support" (POST /api/v1/support) and the public
// /contact page, and are stored as SupportTicket rows tagged with the
// product they came from. The owner answers from /super-admin/inbox;
// the answer is emailed to whoever asked.

import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { supportEmail } from "@/lib/support";

export const PRODUCTS = ["compass", "waypoint", "lantern"] as const;
export type InboxProduct = (typeof PRODUCTS)[number];

export const PRODUCT_NAMES: Record<InboxProduct, string> = {
  compass: "Compass",
  waypoint: "Waypoint",
  lantern: "Lantern",
};

/** What the person picked; stored in SupportTicket.category. */
export const KINDS = ["question", "bug", "feature", "billing", "other"] as const;
export type InboxKind = (typeof KINDS)[number];

export const KIND_NAMES: Record<string, string> = {
  question: "Question",
  bug: "Problem",
  feature: "Idea",
  billing: "Billing",
  abuse: "Report",
  other: "Other",
};

export const STATUSES = ["open", "answered", "closed"] as const;
export type InboxStatus = (typeof STATUSES)[number];

const MAX_CONTEXT_CHARS = 4000;

/** Keeps only a small, flat-ish context object; drops it if too big. */
export function trimContext(context: Record<string, unknown> | undefined | null): Record<string, unknown> | null {
  if (!context) return null;
  const json = JSON.stringify(context);
  if (!json || json === "{}" || json.length > MAX_CONTEXT_CHARS) return null;
  return JSON.parse(json) as Record<string, unknown>;
}

/** A subject for a message sent without one: its first line, cut short. */
export function subjectFrom(message: string): string {
  const first = message.trim().split(/\r?\n/)[0] ?? "";
  return first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first || "(no subject)";
}

export async function createInboxItem(input: {
  product: InboxProduct | null;
  kind: InboxKind;
  subject?: string | null;
  message: string;
  fromEmail: string;
  fromName?: string | null;
  userId?: string | null;
  orgId?: string | null;
  context?: Record<string, unknown> | null;
}) {
  return prisma.supportTicket.create({
    data: {
      product: input.product,
      category: input.kind,
      subject: (input.subject?.trim() || subjectFrom(input.message)).slice(0, 200),
      body: input.message,
      fromEmail: input.fromEmail,
      fromName: input.fromName ?? null,
      userId: input.userId ?? null,
      orgId: input.orgId ?? null,
      status: "open",
      ...(input.context ? { context: input.context as object } : {}),
    },
    select: { id: true },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Store the owner's answer and email it. The reply is kept even when
 * the email fails; `emailed` says which happened.
 */
export async function replyToTicket(input: {
  ticketId: string;
  body: string;
  author: { id: string; displayName: string };
}) {
  const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: input.ticketId } });
  const product = (ticket.product as InboxProduct | null) ?? "compass";
  const sent = await sendMail({
    to: ticket.fromEmail,
    toName: ticket.fromName,
    subject: `Re: ${ticket.subject}`,
    replyTo: supportEmail(),
    html:
      `<p>${escapeHtml(input.body).replace(/\r?\n/g, "<br>")}</p>` +
      `<p>${escapeHtml(input.author.displayName)}<br>${PRODUCT_NAMES[product]}</p>` +
      `<hr><p style="color:#6b7280">You wrote:</p><blockquote style="color:#6b7280">${escapeHtml(ticket.body).replace(/\r?\n/g, "<br>")}</blockquote>`,
  });
  const reply = await prisma.supportReply.create({
    data: {
      ticketId: ticket.id,
      authorUserId: input.author.id,
      authorName: input.author.displayName,
      body: input.body,
      emailed: sent.ok,
    },
  });
  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "answered", acknowledgedAt: ticket.acknowledgedAt ?? new Date() },
  });
  return { reply, emailed: sent.ok, error: sent.ok ? null : sent.error };
}

export async function listInbox({
  status,
  product,
}: {
  status?: InboxStatus | "all" | null;
  product?: InboxProduct | null;
}) {
  // "open" includes rows older code filed as "acknowledged".
  const statusWhere =
    !status || status === "open"
      ? { status: { in: ["open", "acknowledged"] } }
      : status === "all"
        ? {}
        : { status };
  return prisma.supportTicket.findMany({
    where: { ...statusWhere, ...(product ? { product } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      org: { select: { slug: true, displayName: true } },
      _count: { select: { replies: true } },
    },
  });
}
