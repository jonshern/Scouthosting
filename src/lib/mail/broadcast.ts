// Send one message to a built recipient list and record it in MailLog
// + the audit log. Shared by the admin email composer and the event
// announcement route so every org email send shows up in the same
// history.

import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs";
import { renderMarkdownLite } from "@/lib/markdown";
import { audit } from "@/lib/audit";
import type { Recipient } from "@/lib/mail/audience";

export type BroadcastResult = {
  mailLogId: string;
  status: string;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  dryRun: boolean;
};

export async function sendLoggedBroadcast(args: {
  orgId: string;
  author: { id: string; displayName?: string | null };
  subject: string;
  // Markdown-lite source; rendered to HTML here.
  body: string;
  audienceLabel: string;
  recipients: Recipient[];
  dryRun?: boolean;
}): Promise<BroadcastResult> {
  const { orgId, author, subject, body, audienceLabel, recipients } = args;
  const dryRun = !!args.dryRun;
  const html = renderMarkdownLite(body);

  // Snapshot the recipient list at compose time so the MailLog reflects who
  // we *intended* to send to, even if directory rows mutate afterward.
  const recipientSnapshot = recipients.map((r) => ({
    name: r.name,
    email: r.email,
    phone: r.phone ?? null,
    channel: "email" as const,
  }));

  const mailLog = await prisma.mailLog.create({
    data: {
      orgId,
      authorId: author.id,
      subject,
      body,
      channel: "email",
      audienceLabel,
      recipientCount: recipients.length,
      deliveredCount: 0,
      failedCount: 0,
      status: dryRun ? "dryrun" : "queued",
      recipients: recipientSnapshot,
    },
  });

  if (dryRun || recipients.length === 0) {
    audit({
      orgId,
      userId: author.id,
      userDisplay: author.displayName ?? null,
      entityType: "MailLog",
      entityId: mailLog.id,
      action: "create",
      summary: dryRun
        ? `Dry-run “${subject}” to ${audienceLabel} (${recipients.length})`
        : `Composed “${subject}” to ${audienceLabel} (no recipients)`,
    });
    return {
      mailLogId: mailLog.id,
      status: mailLog.status,
      recipientCount: recipients.length,
      deliveredCount: 0,
      failedCount: 0,
      dryRun,
    };
  }

  // One job per recipient (src/lib/jobs/handlers.ts). With the job
  // runtime up, the request returns at once and a crash or deploy
  // mid-send leaves the rest queued instead of lost; each job counts
  // itself on the MailLog and the last one sets the final status.
  // Without it (tests, JOBS_DISABLED) each job runs here in turn.
  let queued = 0;
  for (const r of recipients) {
    const job = await enqueueJob("email.broadcast.send-one", {
      mailLogId: mailLog.id,
      message: { to: r.email, toName: r.name, subject, html },
    });
    if (job.mode === "queued") queued += 1;
  }

  const after = await prisma.mailLog.findUniqueOrThrow({
    where: { id: mailLog.id },
    select: { status: true, deliveredCount: true, failedCount: true },
  });
  const delivered = after.deliveredCount;
  const status = after.status;

  audit({
    orgId,
    userId: author.id,
    userDisplay: author.displayName ?? null,
    entityType: "MailLog",
    entityId: mailLog.id,
    action: "create",
    summary: queued
      ? `Queued “${subject}” to ${audienceLabel} (${recipients.length})`
      : `Sent “${subject}” to ${audienceLabel} (${delivered}/${recipients.length})`,
  });
  return {
    mailLogId: mailLog.id,
    status,
    recipientCount: recipients.length,
    deliveredCount: delivered,
    failedCount: after.failedCount,
    dryRun: false,
  };
}
