// Built-in job handlers. Imported by `src/lib/jobs/index.ts` for the
// side effect of `registerHandler()` calls — keep registrations at
// module init so both queued and in-process modes pick them up.

import { prisma } from "@/lib/db";
import { sendMail, type MailMessage } from "@/lib/mail";
import { sendSms, type SmsMessage } from "@/lib/sms";
import { registerHandler } from "./registry";

type EmailSendData = MailMessage;

/**
 * `email.send` — schedule an email for background delivery. Decouples
 * the request thread from SMTP latency; failed sends retry per the
 * pg-boss policy on enqueue.
 */
registerHandler("email.send", async (data, ctx) => {
  const result = await sendMail(data as EmailSendData);
  if (!result.ok) {
    // Throw so pg-boss retries; queue gives up after retryLimit and
    // surfaces in pg-boss's failed-jobs view.
    throw new Error(`email.send failed: ${result.error || "unknown"}`);
  }
  ctx.logger.info("email sent", {
    to: (data as EmailSendData).to,
    id: result.messageId,
  });
});

type BroadcastJobData = { mailLogId: string; message: MailMessage };

/**
 * `email.broadcast.send-one` — per-recipient broadcast delivery. The
 * /admin/email POST pre-creates a MailLog with status="queued" and
 * recipientCount = N, then enqueues N of these. Each job sends one
 * email and atomically updates the MailLog progress counters. The
 * worker that finishes the last delivery finalizes status (sent /
 * partial / failed).
 */
registerHandler("email.broadcast.send-one", async (data, ctx) => {
  const { mailLogId, message } = (data ?? {}) as Partial<BroadcastJobData>;
  if (!mailLogId || !message) {
    throw new Error("email.broadcast.send-one: missing mailLogId or message");
  }

  let result;
  try {
    result = await sendMail(message);
  } catch (err) {
    result = { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }

  if (result.ok) {
    await prisma.mailLog.update({
      where: { id: mailLogId },
      data: { deliveredCount: { increment: 1 } },
    });
    await maybeFinaliseMailLogStatus(mailLogId);
    ctx.logger.info("broadcast email sent", { mailLogId, to: message.to });
    return;
  }

  await prisma.mailLog.update({
    where: { id: mailLogId },
    data: {
      failedCount: { increment: 1 },
      errors: result.error
        ? `last error (${message.to}): ${result.error}`.slice(0, 4000)
        : "(unknown)",
    },
  });
  await maybeFinaliseMailLogStatus(mailLogId);
});

type SmsBroadcastJobData = { mailLogId: string; message: SmsMessage };

/**
 * `sms.broadcast.send-one` — per-recipient SMS broadcast delivery,
 * mirror of email.broadcast.send-one. Updates the same MailLog row's
 * counters so a mixed-channel broadcast (email + SMS to the same
 * audience) finalises correctly when *both* channels are done.
 */
registerHandler("sms.broadcast.send-one", async (data, ctx) => {
  const { mailLogId, message } = (data ?? {}) as Partial<SmsBroadcastJobData>;
  if (!mailLogId || !message) {
    throw new Error("sms.broadcast.send-one: missing mailLogId or message");
  }

  let result;
  try {
    result = await sendSms(message);
  } catch (err) {
    result = { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }

  if (result.ok) {
    await prisma.mailLog.update({
      where: { id: mailLogId },
      data: { deliveredCount: { increment: 1 } },
    });
    await maybeFinaliseMailLogStatus(mailLogId);
    ctx.logger.info("broadcast SMS sent", { mailLogId, to: message.to });
    return;
  }

  await prisma.mailLog.update({
    where: { id: mailLogId },
    data: {
      failedCount: { increment: 1 },
      errors: result.error
        ? `last error (${message.to}): ${result.error}`.slice(0, 4000)
        : "(unknown)",
    },
  });
  await maybeFinaliseMailLogStatus(mailLogId);
});

/**
 * Once delivered + failed equals the total recipient count, finalize
 * MailLog.status. Atomic via a single UPDATE so concurrent workers
 * don't race to a wrong terminal state.
 */
async function maybeFinaliseMailLogStatus(mailLogId: string): Promise<void> {
  const log = await prisma.mailLog.findUnique({
    where: { id: mailLogId },
    select: { recipientCount: true, deliveredCount: true, failedCount: true, status: true },
  });
  if (!log) return;
  if (log.status !== "queued") return;
  const total = log.deliveredCount + log.failedCount;
  if (total < log.recipientCount) return;
  let next: "sent" | "failed" | "partial";
  if (log.failedCount === 0) next = "sent";
  else if (log.deliveredCount === 0) next = "failed";
  else next = "partial";
  await prisma.mailLog.updateMany({
    where: { id: mailLogId, status: "queued" },
    data: { status: next },
  });
}
