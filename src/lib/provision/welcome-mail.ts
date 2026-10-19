// The welcome email a new unit's founder gets right after /start.
// Trial-end reminders are lib/billing/trial-reminders.ts.

import { sendMail, type MailResult } from "@/lib/mail";
import { orgPublicOrigin } from "@/lib/tenancy/resolve";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" }[c]};`);
}

function longDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

type OrgLink = { slug: string; customDomain?: string | null; displayName: string };

export function welcomeEmail(p: { name: string | null; org: OrgLink; trialEndsAt: Date | null }) {
  const site = orgPublicOrigin(p.org);
  const admin = `${site}/admin`;
  const trial = p.trialEndsAt
    ? `<p>Your free trial runs through ${escapeHtml(longDate(p.trialEndsAt))}. No card needed until then.</p>`
    : "";
  return {
    subject: `${p.org.displayName} is on Compass`,
    html:
      `<p>Hi ${escapeHtml(p.name || "there")},</p>` +
      `<p>${escapeHtml(p.org.displayName)} has a home now: <a href="${escapeHtml(site)}">${escapeHtml(site)}</a></p>` +
      `<p>Three things get a unit going:</p>` +
      `<ol>` +
      `<li>Add your roster (paste a spreadsheet or add people one at a time).</li>` +
      `<li>Invite your leaders and families so they can see the calendar and chat.</li>` +
      `<li>Put your next meeting or campout on the calendar.</li>` +
      `</ol>` +
      `<p><a href="${escapeHtml(admin)}">Open your admin page</a>. There's a checklist at the top that keeps track for you.</p>` +
      trial +
      `<p>One more thing: keep the recovery code from sign-up somewhere safe, like a password manager. ` +
      `It's the only way back into your roster if the passphrase is lost, and we can't show it again.</p>` +
      `<p>Questions? Just reply to this email.</p>`,
  };
}

export async function sendWelcome(p: {
  to: string;
  name: string | null;
  org: OrgLink;
  trialEndsAt: Date | null;
}): Promise<MailResult> {
  return sendMail({ to: p.to, toName: p.name, ...welcomeEmail(p) });
}
