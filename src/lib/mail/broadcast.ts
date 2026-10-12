// Send one message to a built recipient list and record it in MailLog
// + the audit log. Shared by the admin email composer and the event
// announcement route so every org email send shows up in the same
// history.

import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mail";
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

  // Synchronous fan-out (in-process). When the pg-boss port lands these
  // rows go on a queue and a worker fans out; until then we send inline
  // so admins see end-to-end behaviour.
  let delivered = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const r of recipients) {
    const result = await sendMail({ to: r.email, toName: r.name, subject, html });
    if (result.ok) delivered += 1;
    else {
      failed += 1;
      if (errors.length < 5) errors.push(`${r.email}: ${result.error}`);
    }
  }

  const status = failed === 0 ? "sent" : delivered === 0 ? "failed" : "partial";
  await prisma.mailLog.update({
    where: { id: mailLog.id },
    data: {
      deliveredCount: delivered,
      failedCount: failed,
      status,
      errors: errors.length ? errors.join("\n") : null,
    },
  });

  audit({
    orgId,
    userId: author.id,
    userDisplay: author.displayName ?? null,
    entityType: "MailLog",
    entityId: mailLog.id,
    action: "create",
    summary: `Sent “${subject}” to ${audienceLabel} (${delivered}/${recipients.length})`,
  });
  return {
    mailLogId: mailLog.id,
    status,
    recipientCount: recipients.length,
    deliveredCount: delivered,
    failedCount: failed,
    dryRun: false,
  };
}
