// One-shot "send members their balances" email. The treasurer kicks
// it off from /admin/treasury/balances; the underlying helper builds
// per-recipient HTML emails with the running balance and the last 5
// transactions, and sends through the configured mail driver.

import type { Org } from "@prisma/client";
import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { sendMail } from "@/lib/mail";
import { centsToDollars, formatBalance } from "./money";

export type SendBalancesSummary = {
  emailsSent: number;
  membersCovered: number;
  skipped: { name: string; reason: string }[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendBalancesForOrg(
  org: Pick<Org, "id" | "encryptedDek" | "displayName">,
  baseUrl: string,
): Promise<SendBalancesSummary> {
  const skipped: SendBalancesSummary["scoutsSkipped" extends never ? "skipped" : "skipped"] = [];
  if (!org.encryptedDek) return { emailsSent: 0, membersCovered: 0, skipped: [] };
  const dek = unwrapDekWithMaster(org);

  const subaccounts = await prisma.memberSubaccount.findMany({
    where: { orgId: org.id, NOT: { balanceCents: 0 } },
    include: { member: true },
  });

  const memberIds = subaccounts.map((s) => s.memberId);
  const recentByMember = new Map<string, { postedAt: Date; description: string; amountCents: number }[]>();
  if (memberIds.length > 0) {
    const txns = await prisma.transaction.findMany({
      where: { orgId: org.id, memberId: { in: memberIds } },
      orderBy: { postedAt: "desc" },
      take: memberIds.length * 5,
    });
    for (const t of txns) {
      if (!t.memberId) continue;
      const list = recentByMember.get(t.memberId) ?? [];
      if (list.length < 5) {
        list.push({ postedAt: t.postedAt, description: t.description, amountCents: t.amountCents });
        recentByMember.set(t.memberId, list);
      }
    }
  }

  let sent = 0;
  let covered = 0;

  for (const sub of subaccounts) {
    const m = sub.member;
    const pii = decryptMemberPii(m, dek, org.id);
    const scoutName = `${pii.firstName} ${pii.lastName}`.trim() || "Scout";

    // Recipients: parents with email if they exist; otherwise the
    // member's own email.
    const recipients: { email: string; name: string }[] = [];
    if (m.parentIds.length > 0) {
      const parents = await prisma.member.findMany({
        where: { orgId: org.id, id: { in: m.parentIds } },
      });
      for (const p of parents) {
        if (!p.email) continue;
        const ppii = decryptMemberPii(p, dek, org.id);
        recipients.push({
          email: p.email,
          name: `${ppii.firstName} ${ppii.lastName}`.trim() || "Parent",
        });
      }
    }
    if (recipients.length === 0 && m.email) {
      recipients.push({ email: m.email, name: scoutName });
    }
    if (recipients.length === 0) {
      skipped.push({ name: scoutName, reason: "No email on file." });
      continue;
    }

    const recent = recentByMember.get(m.id) ?? [];
    const html = renderEmail({
      orgName: org.displayName,
      scoutName,
      balanceCents: sub.balanceCents,
      recent,
      portalUrl: `${baseUrl.replace(/\/$/, "")}/account/my-scouts`,
    });

    let any = false;
    for (const r of recipients) {
      const result = await sendMail({
        to: r.email,
        toName: r.name,
        subject: `${org.displayName} balance update for ${scoutName}`,
        html,
      });
      if (result.ok) {
        sent += 1;
        any = true;
      }
    }
    if (any) covered += 1;
    else skipped.push({ name: scoutName, reason: "Mail driver rejected every recipient." });
  }

  return { emailsSent: sent, membersCovered: covered, skipped };
}

function renderEmail(args: {
  orgName: string;
  scoutName: string;
  balanceCents: number;
  recent: { postedAt: Date; description: string; amountCents: number }[];
  portalUrl: string;
}): string {
  const balanceColor = args.balanceCents < 0 ? "#dc2626" : "#059669";
  const status = args.balanceCents < 0 ? "Family owes the unit" : "Credit on file";
  return `<!doctype html>
<html><body style="font-family:'Inter Tight',Inter,system-ui,sans-serif;color:#0f172a;background:#f7f8fa;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
    <h1 style="font-family:'Newsreader',Georgia,serif;font-weight:500;font-size:24px;margin:0 0 4px;">
      ${escapeHtml(args.orgName)} · Balance update
    </h1>
    <p style="color:#64748b;margin:0 0 18px;">For: <strong>${escapeHtml(args.scoutName)}</strong></p>
    <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;margin-bottom:16px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#64748b;margin-bottom:6px;">
        Current balance
      </div>
      <div style="font-family:'Newsreader',Georgia,serif;font-size:28px;color:${balanceColor};">
        ${escapeHtml(formatBalance(args.balanceCents))}
      </div>
      <div style="font-size:12px;color:#64748b;margin-top:4px;">${escapeHtml(status)}</div>
    </div>
    ${
      args.recent.length === 0
        ? ""
        : `<div style="margin-bottom:16px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#64748b;margin-bottom:8px;">Last 5 transactions</div>
            <ul style="list-style:none;padding:0;margin:0;">
              ${args.recent
                .map(
                  (t) => `<li style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eef1f5;font-size:14px;">
                    <span><strong>${escapeHtml(t.postedAt.toLocaleDateString())}</strong> ${escapeHtml(t.description)}</span>
                    <span style="font-family:ui-monospace,monospace;color:${
                      t.amountCents < 0 ? "#dc2626" : "#059669"
                    };">${escapeHtml(centsToDollars(t.amountCents))}</span>
                  </li>`,
                )
                .join("")}
            </ul>
          </div>`
    }
    <p style="margin-top:18px;">
      <a href="${escapeHtml(args.portalUrl)}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;">
        Open my Scouts portal
      </a>
    </p>
    <p style="font-size:12px;color:#64748b;margin-top:18px;">
      Treasurer questions go to your unit's leadership; this is an automated balance update.
    </p>
  </div>
</body></html>`;
}
