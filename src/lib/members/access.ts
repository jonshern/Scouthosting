// Who can get into a unit, and how. A unit's founder gets in at /start;
// everyone else joins through the roster: an adult on the roster whose
// email matches a confirmed Compass account becomes a member of the unit
// (role "parent", which opens the unit's calendar, chat and photos). An
// admin then raises a person to leader or admin on their roster page.
//
// Only ever join with an email the user has proven (a Google/Apple
// sign-in with a verified email, or a completed email-verification link),
// the same rule as claim-orgs.ts: otherwise anyone could type a parent's
// address and read the unit's chat.

import { prisma } from "@/lib/db";
import { sendMail, type MailResult } from "@/lib/mail";
import { orgPublicOrigin } from "@/lib/tenancy/resolve";
import type { Role } from "@/lib/auth/role";
import { provisionStandingChannels } from "@/lib/chat";
import { logger } from "@/lib/log";

export const ACCESS_LEVELS = ["parent", "leader", "admin"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LABEL: Record<Role, string> = {
  scout: "Scout",
  parent: "Family",
  leader: "Leader",
  admin: "Admin",
};

export const ACCESS_HINT: Record<AccessLevel, string> = {
  parent: "Calendar, chat, photos and their own scouts.",
  leader: "Everything a family sees, plus the admin pages (not billing or treasury).",
  admin: "Everything, including billing, access and settings.",
};

/** The audit action recorded each time someone is sent an invite. */
export const INVITE_ACTION = "member.invited";

/**
 * Join every unit (or just `orgId`) where an active adult on the roster
 * has this email. Returns the ids of the units joined just now; units the
 * user already belongs to keep their current role.
 */
export async function joinUnitsByRosterEmail(
  userId: string,
  email: string,
  opts: { orgId?: string } = {},
): Promise<string[]> {
  const rows = await prisma.member.findMany({
    where: {
      email: { equals: email.trim(), mode: "insensitive" },
      isYouth: false,
      deletedAt: null,
      status: "active",
      ...(opts.orgId ? { orgId: opts.orgId } : {}),
    },
    select: { orgId: true },
  });
  const orgIds = [...new Set(rows.map((r) => r.orgId))];
  if (orgIds.length === 0) return [];
  const existing = await prisma.orgMembership.findMany({
    where: { userId, orgId: { in: orgIds } },
    select: { orgId: true },
  });
  const have = new Set(existing.map((m) => m.orgId));
  const fresh = orgIds.filter((id) => !have.has(id));
  if (fresh.length === 0) return [];
  await prisma.orgMembership.createMany({
    data: fresh.map((orgId) => ({ userId, orgId, role: "parent" as const })),
    skipDuplicates: true,
  });
  for (const orgId of fresh) await refreshUnitChannels(orgId);
  return fresh;
}

/**
 * Make sure the unit's standing chats (all members, parents, leaders,
 * patrols) exist and hold the right people. Run after anyone joins or
 * changes access; a failure never blocks the join itself.
 */
export async function refreshUnitChannels(orgId: string): Promise<void> {
  try {
    const org = await prisma.org.findUnique({ where: { id: orgId }, select: { id: true, displayName: true } });
    if (org) await provisionStandingChannels({ org, prismaClient: prisma });
  } catch (err) {
    logger.warn("unit channel refresh failed", { orgId, err: err instanceof Error ? err.message : String(err) });
  }
}

export type MemberAccess =
  | { joined: false }
  | { joined: true; userId: string; role: Role; isOwner: boolean };

/** Whether the account with this roster entry's email has joined the unit. */
export async function memberAccess(
  org: { id: string; ownerId: string | null },
  email: string | null,
): Promise<MemberAccess> {
  if (!email) return { joined: false };
  const user = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
    select: { id: true, memberships: { where: { orgId: org.id }, select: { role: true } } },
  });
  const m = user?.memberships[0];
  if (!user || !m) return { joined: false };
  return { joined: true, userId: user.id, role: m.role as Role, isOwner: org.ownerId === user.id };
}

/** When this roster entry was last sent an invite, if ever. */
export async function lastInvitedAt(orgId: string, memberId: string): Promise<Date | null> {
  const row = await prisma.auditLog.findFirst({
    where: { orgId, entityType: "Member", entityId: memberId, action: INVITE_ACTION },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" }[c]};`);
}

export function joinLink(org: { slug: string; customDomain?: string | null }): string {
  return `${orgPublicOrigin(org)}/join`;
}

export function unitInviteEmail(p: {
  unitName: string;
  firstName: string | null;
  inviterName: string | null;
  email: string;
  link: string;
}) {
  const from = p.inviterName ? `${p.inviterName} added you` : "You've been added";
  return {
    subject: `Join ${p.unitName} on Compass`,
    html:
      `<p>Hi ${escapeHtml(p.firstName || "there")},</p>` +
      `<p>${escapeHtml(from)} to ${escapeHtml(p.unitName)}'s site on Compass. ` +
      `It's where the calendar, RSVPs, permission slips, photos and unit chat live.</p>` +
      `<p><a href="${escapeHtml(p.link)}">Join ${escapeHtml(p.unitName)}</a></p>` +
      `<p>Make your account with this address (${escapeHtml(p.email)}) so we can match you to the roster. ` +
      `Already have a Compass account? Just sign in.</p>` +
      `<p>Questions? Reply to this email or ask your unit's leaders.</p>`,
  };
}

export async function sendUnitInvite(p: {
  org: { slug: string; customDomain?: string | null; displayName: string };
  to: string;
  firstName: string | null;
  inviterName: string | null;
}): Promise<MailResult> {
  const mail = unitInviteEmail({
    unitName: p.org.displayName,
    firstName: p.firstName,
    inviterName: p.inviterName,
    email: p.to,
    link: joinLink(p.org),
  });
  return sendMail({ to: p.to, toName: p.firstName, ...mail });
}
