"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";

// Pending → Approve / Decline. The roster's "Pending" tab lists
// Member rows with status="prospect" (the existing leads workflow);
// these actions move them to status="active" (approved) or
// status="alumni" (declined — kept for history but excluded from
// broadcasts and the default roster).

type AuthOk = {
  user: NonNullable<Awaited<ReturnType<typeof getSession>>["user"]>;
  org: NonNullable<Awaited<ReturnType<typeof prisma.org.findUnique>>>;
};
type AuthErr = { error: string };
async function authorizeLeader(orgSlug: string): Promise<AuthOk | AuthErr> {
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) return { error: "Site not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };
  return { user, org };
}

const Schema = z.object({
  orgSlug: z.string().min(1),
  memberId: z.string().min(1),
});

export type PendingState = { ok?: true; error?: string } | null;

export async function approvePending(
  _prev: PendingState,
  formData: FormData,
): Promise<PendingState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };

  const member = await prisma.member.findUnique({ where: { id: parsed.data.memberId } });
  if (!member || member.orgId !== auth.org.id) return { error: "Member not found." };
  if (member.status !== "prospect") return { error: "Not a pending prospect." };

  await prisma.member.update({
    where: { id: member.id },
    data: { status: "active", firstContactedAt: member.firstContactedAt ?? new Date() },
  });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Member",
    entityId: member.id,
    action: "update",
    summary: `Approved pending member`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/members`);
  return { ok: true };
}

export async function declinePending(
  _prev: PendingState,
  formData: FormData,
): Promise<PendingState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };

  const member = await prisma.member.findUnique({ where: { id: parsed.data.memberId } });
  if (!member || member.orgId !== auth.org.id) return { error: "Member not found." };
  if (member.status !== "prospect") return { error: "Not a pending prospect." };

  // Soft-archive: alumni status keeps the row for history but
  // excludes them from broadcasts + the default roster filter.
  await prisma.member.update({
    where: { id: member.id },
    data: { status: "alumni" },
  });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Member",
    entityId: member.id,
    action: "update",
    summary: `Declined pending member (moved to alumni)`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/members`);
  return { ok: true };
}
