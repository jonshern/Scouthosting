"use server";

// Inviting people into a unit and setting what they can reach. Leaders
// invite (the email links to the unit's /join page); only admins change
// someone's access level. See lib/members/access.ts for the join rule.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg, type Role } from "@/lib/auth/role";
import { organizerStandingOk } from "@/lib/admin/guard";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { audit } from "@/lib/audit";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import {
  ACCESS_LABEL,
  ACCESS_LEVELS,
  INVITE_ACTION,
  memberAccess,
  refreshUnitChannels,
  sendUnitInvite,
} from "@/lib/members/access";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** "Invite everyone" skips people invited more recently than this. */
const REINVITE_AFTER_MS = 3 * DAY_MS;
const BULK_CAP = 500;

type Org = NonNullable<Awaited<ReturnType<typeof prisma.org.findUnique>>>;
type User = NonNullable<Awaited<ReturnType<typeof getSession>>["user"]>;
type AuthOk = { user: User; org: Org; role: Role | null; isAdmin: boolean };

async function authorize(orgSlug: string): Promise<AuthOk | { error: string }> {
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) return { error: "Site not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };
  if (!(await organizerStandingOk(user.id))) return { error: "Turn on two-step sign-in first." };
  return { user, org, role, isAdmin: role === "admin" || !!user.isSuperAdmin };
}

async function checkForm(formData: FormData): Promise<string | null> {
  if (!(await verifyOrigin())) return "Bad origin.";
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return "Bad CSRF.";
  return null;
}

function firstNameOf(org: Org, member: Parameters<typeof decryptMemberPii>[0]): string | null {
  if (!org.encryptedDek) return null;
  try {
    return decryptMemberPii(member, unwrapDekWithMaster(org), org.id).firstName || null;
  } catch {
    return null;
  }
}

export type InviteState = { ok?: string; error?: string } | null;

const OneSchema = z.object({ orgSlug: z.string().min(1), memberId: z.string().min(1) });

export async function inviteMember(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const bad = await checkForm(formData);
  if (bad) return { error: bad };
  const parsed = OneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorize(parsed.data.orgSlug);
  if ("error" in auth) return auth;

  const member = await prisma.member.findUnique({ where: { id: parsed.data.memberId } });
  if (!member || member.orgId !== auth.org.id || member.deletedAt) return { error: "Member not found." };
  if (member.isYouth) return { error: "Scouts don't get accounts. Invite their parents." };
  if (!member.email) return { error: "Add an email address first." };
  if ((await memberAccess(auth.org, member.email)).joined) return { error: "They've already joined." };
  if (!(await rateLimit(`unit-invite:${auth.org.id}`, 60, HOUR_MS)).ok) {
    return { error: "That's a lot of invites for one hour. Try again later." };
  }

  const sent = await sendUnitInvite({
    org: auth.org,
    to: member.email,
    firstName: firstNameOf(auth.org, member),
    inviterName: auth.user.displayName || null,
  });
  if (!sent.ok) return { error: "The email didn't go out. Try again in a bit." };
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Member",
    entityId: member.id,
    action: INVITE_ACTION,
    summary: "Sent an invite to join the unit",
  });
  revalidatePath(`/o/${auth.org.slug}/admin/members/${member.id}`);
  return { ok: `Invite sent to ${member.email}.` };
}

const AllSchema = z.object({ orgSlug: z.string().min(1) });

/** Invite every active adult with an email who hasn't joined or been invited lately. */
export async function inviteEveryone(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const bad = await checkForm(formData);
  if (bad) return { error: bad };
  const parsed = AllSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorize(parsed.data.orgSlug);
  if ("error" in auth) return auth;
  if (!(await rateLimit(`unit-invite-all:${auth.org.id}`, 3, DAY_MS)).ok) {
    return { error: "You've sent invites to everyone a few times today. Try again tomorrow." };
  }

  const adults = await prisma.member.findMany({
    where: { orgId: auth.org.id, isYouth: false, deletedAt: null, status: "active", email: { not: null } },
    take: BULK_CAP,
  });
  const emails = [...new Set(adults.map((a) => a.email!.toLowerCase()))];
  const joined = new Set(
    (
      await prisma.user.findMany({
        where: { email: { in: emails, mode: "insensitive" }, memberships: { some: { orgId: auth.org.id } } },
        select: { email: true },
      })
    ).map((u) => u.email.toLowerCase()),
  );
  const recent = new Set(
    (
      await prisma.auditLog.findMany({
        where: {
          orgId: auth.org.id,
          entityType: "Member",
          action: INVITE_ACTION,
          createdAt: { gte: new Date(Date.now() - REINVITE_AFTER_MS) },
        },
        select: { entityId: true },
      })
    ).map((r) => r.entityId),
  );

  const seen = new Set<string>();
  let sent = 0;
  let failed = 0;
  for (const m of adults) {
    const email = m.email!.toLowerCase();
    if (joined.has(email) || recent.has(m.id) || seen.has(email)) continue;
    seen.add(email);
    const res = await sendUnitInvite({
      org: auth.org,
      to: m.email!,
      firstName: firstNameOf(auth.org, m),
      inviterName: auth.user.displayName || null,
    });
    if (!res.ok) {
      failed++;
      continue;
    }
    sent++;
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "Member",
      entityId: m.id,
      action: INVITE_ACTION,
      summary: "Sent an invite to join the unit",
    });
  }
  revalidatePath(`/o/${auth.org.slug}/admin/members`);
  revalidatePath(`/o/${auth.org.slug}/admin`);
  if (sent === 0 && failed === 0) return { ok: "Everyone with an email has joined or was invited in the last few days." };
  const msg = `Sent ${sent} invite${sent === 1 ? "" : "s"}.`;
  return failed ? { error: `${msg} ${failed} didn't go out; try again later.` } : { ok: msg };
}

const AccessSchema = z.object({
  orgSlug: z.string().min(1),
  memberId: z.string().min(1),
  role: z.enum(ACCESS_LEVELS),
});

export async function setMemberAccess(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const bad = await checkForm(formData);
  if (bad) return { error: bad };
  const parsed = AccessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorize(parsed.data.orgSlug);
  if ("error" in auth) return auth;
  if (!auth.isAdmin) return { error: "Only admins can change someone's access." };

  const member = await prisma.member.findUnique({ where: { id: parsed.data.memberId } });
  if (!member || member.orgId !== auth.org.id || member.deletedAt) return { error: "Member not found." };
  const access = await memberAccess(auth.org, member.email);
  if (!access.joined) return { error: "They haven't joined yet. Send an invite first." };
  if (access.isOwner) return { error: "The unit's owner stays an admin." };
  if (access.userId === auth.user.id) return { error: "Ask another admin to change your own access." };
  if (access.role === parsed.data.role) return { ok: "No change." };

  await prisma.orgMembership.update({
    where: { userId_orgId: { userId: access.userId, orgId: auth.org.id } },
    data: { role: parsed.data.role },
  });
  await refreshUnitChannels(auth.org.id);
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "OrgMembership",
    entityId: access.userId,
    action: "member.access_changed",
    summary: `Changed access from ${ACCESS_LABEL[access.role]} to ${ACCESS_LABEL[parsed.data.role]}`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/members/${member.id}`);
  return { ok: `Now ${ACCESS_LABEL[parsed.data.role].toLowerCase()} access.` };
}
