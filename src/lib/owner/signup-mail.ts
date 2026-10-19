// Emails the owner sends from the sign-ups queue: an invite to try a
// product, and a note asking a unit on trial to pick a plan. Both go
// through sendMail, so a demo deployment captures them.

import { sendMail, type MailResult } from "@/lib/mail";
import { apexPublicOrigin, orgPublicOrigin } from "@/lib/tenancy/resolve";
import { PRICES } from "@/lib/billing/pricing";
import { PRODUCT_LABEL, type Product } from "./console";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" }[c]};`);
}

/** Compass invites start a unit at /start; the apps share one account made at /signup. */
export function inviteLink(product: Product, origin = apexPublicOrigin()): string {
  return product === "compass" ? `${origin}/start` : `${origin}/signup`;
}

const INVITE_PITCH: Record<Product, string> = {
  compass: "Compass runs your unit's website, calendar, roster and messages in one place, free for 30 days.",
  waypoint: "Waypoint is the merit badge counselor app: your badges, your scouts and badge days, on your phone.",
  lantern: "Lantern keeps your scout's whole trail, ranks and merit badges, in one place you can check off together.",
};

export function inviteEmail(p: { product: Product; name: string | null; note: string | null; link: string }) {
  const label = PRODUCT_LABEL[p.product];
  return {
    subject: `You're invited to try ${label}`,
    html:
      `<p>Hi ${escapeHtml(p.name || "there")},</p>` +
      `<p>${escapeHtml(INVITE_PITCH[p.product])}</p>` +
      (p.note ? `<p>${escapeHtml(p.note)}</p>` : "") +
      `<p><a href="${escapeHtml(p.link)}">Create your account</a></p>` +
      `<p>Reply to this email with any questions.</p>`,
  };
}

export async function sendInvite(p: {
  email: string;
  name: string | null;
  product: Product;
  note: string | null;
}): Promise<MailResult> {
  const mail = inviteEmail({ ...p, link: inviteLink(p.product) });
  return sendMail({ to: p.email, toName: p.name, ...mail });
}

export function billingLink(org: { slug: string; customDomain?: string | null }): string {
  return `${orgPublicOrigin(org)}/admin/billing`;
}

export async function sendPlanReminder(p: {
  email: string;
  name: string | null;
  org: { slug: string; customDomain?: string | null; displayName: string };
  trialEndsAt: Date | null;
}): Promise<MailResult> {
  const ends = p.trialEndsAt
    ? ` Your free trial ends ${p.trialEndsAt.toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`
    : "";
  return sendMail({
    to: p.email,
    toName: p.name,
    subject: `Keep ${p.org.displayName} on Compass`,
    html:
      `<p>Hi ${escapeHtml(p.name || "there")},</p>` +
      `<p>Thanks for trying Compass with ${escapeHtml(p.org.displayName)}.${escapeHtml(ends)} ` +
      `Pick a plan to keep everything running: ${PRICES.year.long} or ${PRICES.month.long}.</p>` +
      `<p><a href="${escapeHtml(billingLink(p.org))}">Pick a plan</a></p>` +
      `<p>Reply to this email if you have questions or need more time.</p>`,
  });
}
