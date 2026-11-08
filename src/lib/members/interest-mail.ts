// The email a unit's Scoutmaster gets when a family sends the "Join our
// troop" form (server-actions/interest.ts). Reply-To is the family, so
// answering is one tap.

import { sendMail, type MailResult } from "@/lib/mail";
import { orgPublicOrigin } from "@/lib/tenancy/resolve";

export const INTEREST_AGES = ["Under 11", "11", "12", "13", "14", "15", "16", "17"] as const;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" }[c]};`);
}

/** The unit's word for itself: "troop", "pack", "crew". */
export function unitWord(unitType: string): string {
  const w: Record<string, string> = { Troop: "troop", Pack: "pack", Crew: "crew", Ship: "ship", Post: "post", GirlScoutTroop: "troop" };
  return w[unitType] ?? "unit";
}

export function interestEmail(p: {
  org: { slug: string; customDomain?: string | null; displayName: string };
  from: { name: string; email: string; phone: string | null };
  scout: string | null;
  message: string | null;
  alreadyOnRoster: boolean;
  leadId: string | null;
}) {
  const pending = `${orgPublicOrigin(p.org)}/admin/members?tab=pending`;
  const lines = [
    `<p><strong>${esc(p.from.name)}</strong> asked about joining ${esc(p.org.displayName)}.</p>`,
    `<p>Email: ${esc(p.from.email)}${p.from.phone ? `<br>Phone: ${esc(p.from.phone)}` : ""}${p.scout ? `<br>Scout: ${esc(p.scout)}` : ""}</p>`,
    p.message ? `<blockquote style="border-left:3px solid #ddd;margin:0;padding-left:12px">${esc(p.message).replace(/\n/g, "<br>")}</blockquote>` : "",
    p.alreadyOnRoster
      ? `<p>This email is already on your roster.</p>`
      : `<p>They're on your roster's Pending list. <a href="${esc(pending)}">Approve or decline them there</a>.</p>`,
    `<p>Reply to this email to write back to them.</p>`,
  ];
  return {
    subject: `${p.from.name} wants to know about ${p.org.displayName}`,
    html: lines.filter(Boolean).join(""),
  };
}

export async function sendInterestNotice(p: Parameters<typeof interestEmail>[0] & { to: string }): Promise<MailResult> {
  return sendMail({ to: p.to, replyTo: p.from.email, ...interestEmail(p) });
}
