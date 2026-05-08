// Dispatch permission slip emails to the parent(s) of every yes-RSVP
// youth on an event. One email per (parent, youth) pair so a parent
// with two scouts in the unit gets two emails (one signs each).
//
// Re-running the dispatch is safe: each email contains a fresh signed
// token, but the public sign route upserts on (eventId, memberId), so
// the latest signature wins. We don't track "delivered" state here —
// Resend webhooks already populate MailEvent rows when configured.
//
// Returns a summary the admin server action can surface back to the
// page so leaders see what actually went out.

import type { Org, Event } from "@prisma/client";
import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { makePermSlipToken } from "@/lib/security/perm-slip-token";
import { sendMail } from "@/lib/mail";
import { effectiveSlipText } from "./index";

export type DispatchSummary = {
  emailsSent: number;
  scoutsCovered: number;
  scoutsSkipped: { name: string; reason: string }[];
};

export async function dispatchPermissionSlips(
  org: Pick<Org, "id" | "encryptedDek">,
  event: Pick<Event, "id" | "title" | "startsAt" | "location" | "permissionSlipText">,
  baseUrl: string,
): Promise<DispatchSummary> {
  if (!org.encryptedDek) {
    return { emailsSent: 0, scoutsCovered: 0, scoutsSkipped: [] };
  }

  const rsvps = await prisma.rsvp.findMany({
    where: { orgId: org.id, eventId: event.id, response: "yes", memberId: { not: null } },
    include: { member: true },
  });
  const youthRsvps = rsvps.filter((r) => r.member?.isYouth);

  // Resolve parents in one round-trip.
  const parentIds = new Set<string>();
  for (const r of youthRsvps) {
    for (const pid of r.member!.parentIds) parentIds.add(pid);
  }
  const parents = parentIds.size
    ? await prisma.member.findMany({
        where: { orgId: org.id, id: { in: [...parentIds] } },
      })
    : [];
  const parentById = new Map(parents.map((p) => [p.id, p]));
  const dek = unwrapDekWithMaster(org);
  const slipText = effectiveSlipText(event.permissionSlipText);

  const skipped: DispatchSummary["scoutsSkipped"] = [];
  let sent = 0;
  let covered = 0;

  for (const r of youthRsvps) {
    const m = r.member!;
    const scoutPii = decryptMemberPii(m, dek, org.id);
    const scoutLabel = `${scoutPii.firstName} ${scoutPii.lastName}`.trim() || "Scout";

    const recipients = m.parentIds.flatMap((pid) => {
      const p = parentById.get(pid);
      if (!p?.email) return [];
      const ppii = decryptMemberPii(p, dek, org.id);
      return [
        {
          memberId: p.id,
          email: p.email,
          name: `${ppii.firstName} ${ppii.lastName}`.trim() || "Parent",
        },
      ];
    });

    if (recipients.length === 0) {
      skipped.push({ name: scoutLabel, reason: "No parents linked with an email." });
      continue;
    }

    let anySent = false;
    for (const recipient of recipients) {
      const token = makePermSlipToken({
        orgId: org.id,
        eventId: event.id,
        memberId: m.id,
        parentEmail: recipient.email,
        parentName: recipient.name,
      });
      const url = `${baseUrl.replace(/\/$/, "")}/permission-slip/${token}`;
      const when = event.startsAt.toLocaleString();
      const html = renderEmailHtml({
        scoutLabel,
        parentName: recipient.name,
        eventTitle: event.title,
        eventWhen: when,
        eventWhere: event.location,
        slipText,
        url,
      });
      const result = await sendMail({
        to: recipient.email,
        toName: recipient.name,
        subject: `Permission slip — ${event.title} (${when})`,
        html,
      });
      if (result.ok) {
        sent += 1;
        anySent = true;
      }
    }
    if (anySent) covered += 1;
    else skipped.push({ name: scoutLabel, reason: "Mail driver rejected every parent address." });
  }

  return { emailsSent: sent, scoutsCovered: covered, scoutsSkipped: skipped };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmailHtml(args: {
  scoutLabel: string;
  parentName: string;
  eventTitle: string;
  eventWhen: string;
  eventWhere: string | null;
  slipText: string;
  url: string;
}): string {
  return `<!doctype html>
<html><body style="font-family:'Inter Tight',Inter,system-ui,sans-serif;color:#0f172a;background:#f7f8fa;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
    <h1 style="font-family:'Newsreader',Georgia,serif;font-weight:500;font-size:24px;margin:0 0 8px;">
      Permission slip — ${escapeHtml(args.eventTitle)}
    </h1>
    <p style="color:#64748b;margin:0 0 20px;">${escapeHtml(args.eventWhen)}${
      args.eventWhere ? " · " + escapeHtml(args.eventWhere) : ""
    }</p>
    <p>Hi ${escapeHtml(args.parentName)},</p>
    <p>Your unit has scheduled <strong>${escapeHtml(args.eventTitle)}</strong>, and ${escapeHtml(
      args.scoutLabel,
    )} is on the yes list. Please confirm your permission so the leaders know they're cleared to attend.</p>
    <p style="border-left:3px solid #1d4ed8;padding-left:12px;color:#334155;font-size:14px;">
      ${escapeHtml(args.slipText)}
    </p>
    <p style="margin-top:24px;">
      <a href="${escapeHtml(args.url)}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;">
        Sign permission slip
      </a>
    </p>
    <p style="color:#64748b;font-size:12px;margin-top:24px;">
      This link is valid for 90 days. We record your name, the time, and your IP when you sign.
    </p>
  </div>
</body></html>`;
}
