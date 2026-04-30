// Equipment-loan return reminders.
//
// Pure helper called by the /admin/equipment/loans/remind action. Picks
// every open loan whose dueAt is in the past, resolves a recipient email,
// emails the borrower, and records `lastReminderAt`. A 24-hour throttle
// protects against an accidental double-click sending duplicate nudges.
//
// Recipient resolution prefers the linked Member's email (and respects
// `Member.commPreference !== "none"`). Free-form loans fall back to
// `loan.borrowerEmail`. Loans with no resolvable email are skipped — the
// helper returns them under `skipped` so the caller can show the leader
// who needs a phone call instead.
//
// The helper writes a single AuditLog entry summarizing the run rather
// than one per email, because the action is logically "leader pressed
// the Send-reminders button at T".

import { prisma } from "./db.js";
import { sendBatch } from "./mail.js";
import { recordAudit } from "./audit.js";

const THROTTLE_MS = 24 * 60 * 60 * 1000;

/**
 * Pick the best email for a loan, or null if none is available.
 * @returns {string|null}
 */
function recipientFor(loan) {
  // Member link wins, gated by commPreference (parents can opt out).
  const member = loan.member;
  if (member?.email && member.commPreference !== "none") return member.email;
  // Anonymous / free-form loan — the original check-out form's email.
  if (loan.borrowerEmail) return loan.borrowerEmail;
  return null;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function buildEmail({ org, loan, apexUrl }) {
  const due = fmtDate(loan.dueAt);
  const borrower = loan.borrowerName;
  const item = loan.equipment.name;
  const subject = `[${org.displayName}] Reminder: please return ${item}`;
  const text = `Hi ${borrower},

Our records show ${item} was due back on ${due} and we don't have it logged
as returned yet. When you have a chance, please bring it to the next meeting
or coordinate a drop-off with the Quartermaster.

If you've already returned it, you can ignore this — the leader who logged
the return will catch up the records.

Thanks!
${org.displayName}
${apexUrl}
`;
  const html = `<p>Hi ${escapeHtml(borrower)},</p>
<p>Our records show <strong>${escapeHtml(item)}</strong> was due back on
<strong>${escapeHtml(due)}</strong> and we don't have it logged as returned yet.
When you have a chance, please bring it to the next meeting or coordinate a
drop-off with the Quartermaster.</p>
<p>If you've already returned it, you can ignore this — the leader who logged
the return will catch up the records.</p>
<p>Thanks!<br/>${escapeHtml(org.displayName)}<br/>
<a href="${escapeHtml(apexUrl)}">${escapeHtml(apexUrl)}</a></p>`;
  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Find every overdue open loan whose last reminder was more than
 * THROTTLE_MS ago (or never sent), email the borrowers, mark
 * `lastReminderAt`, and audit-log the run.
 *
 * Pure-functional input contract via `prismaClient` makes the function
 * trivially testable against a mocked client.
 *
 * @param {Object} params
 * @param {Object} params.org   — { id, displayName, slug }
 * @param {Object} [params.user] — leader who pressed the button (for audit)
 * @param {Date}   [params.now]  — pinned wall-clock for tests
 * @param {Object} [params.prismaClient] — override for tests
 * @param {Function} [params.sender] — override sendBatch for tests
 * @returns {Promise<{
 *   total: number,
 *   sent: { loanId: string, to: string }[],
 *   skipped: { loanId: string, reason: string, borrowerName: string }[],
 *   throttled: { loanId: string }[],
 *   errors: { loanId: string, error: string }[],
 * }>}
 */
export async function sendOverdueReminders({
  org,
  user,
  now = new Date(),
  prismaClient = prisma,
  sender = sendBatch,
} = {}) {
  if (!org?.id) throw new Error("sendOverdueReminders: missing org");

  const overdue = await prismaClient.equipmentLoan.findMany({
    where: {
      orgId: org.id,
      returnedAt: null,
      dueAt: { lt: now, not: null },
    },
    include: {
      equipment: { select: { id: true, name: true } },
      member: { select: { email: true, commPreference: true } },
    },
  });

  const sent = [];
  const skipped = [];
  const throttled = [];
  const messages = [];
  const messageLoanIds = [];

  for (const loan of overdue) {
    if (
      loan.lastReminderAt &&
      now.getTime() - new Date(loan.lastReminderAt).getTime() < THROTTLE_MS
    ) {
      throttled.push({ loanId: loan.id });
      continue;
    }
    const to = recipientFor(loan);
    if (!to) {
      skipped.push({
        loanId: loan.id,
        reason: "no email on file",
        borrowerName: loan.borrowerName,
      });
      continue;
    }
    const apexUrl = `https://${org.slug}.${process.env.APEX_DOMAIN || "compass.app"}`;
    const { subject, text, html } = buildEmail({ org, loan, apexUrl });
    messages.push({ to, subject, text, html });
    messageLoanIds.push({ loanId: loan.id, to });
  }

  const batch = messages.length
    ? await sender(messages)
    : { sent: 0, errors: [] };

  // Walk results back into per-loan outcomes. sendBatch reports errors
  // by recipient address, so we map back to loanIds.
  const errorByTo = new Map((batch.errors || []).map((e) => [e.to, e.error]));
  const sentLoanIds = [];
  for (const m of messageLoanIds) {
    if (errorByTo.has(m.to)) continue;
    sent.push({ loanId: m.loanId, to: m.to });
    sentLoanIds.push(m.loanId);
  }

  if (sentLoanIds.length) {
    await prismaClient.equipmentLoan.updateMany({
      where: { id: { in: sentLoanIds } },
      data: { lastReminderAt: now },
    });
  }

  const errors = (batch.errors || []).map((e) => {
    const m = messageLoanIds.find((x) => x.to === e.to);
    return { loanId: m?.loanId || "?", error: e.error };
  });

  await recordAudit({
    org,
    user,
    entityType: "EquipmentLoan",
    action: "remind",
    summary: `${sent.length} sent, ${skipped.length} skipped, ${throttled.length} throttled, ${errors.length} failed`,
  });

  return {
    total: overdue.length,
    sent,
    skipped,
    throttled,
    errors,
  };
}

export const _internal = {
  recipientFor,
  buildEmail,
  THROTTLE_MS,
};
