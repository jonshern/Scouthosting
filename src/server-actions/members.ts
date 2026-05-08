"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii, encryptMemberPii } from "@/lib/members/crypto";

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

const MemberInput = z.object({
  orgSlug: z.string().min(1),
  id: z.string().optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  street: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  state: z.string().trim().max(60).optional().or(z.literal("")),
  zip: z.string().trim().max(20).optional().or(z.literal("")),
  isYouth: z.union([z.literal("on"), z.literal("")]).optional(),
  patrol: z.string().trim().max(50).optional().or(z.literal("")),
  position: z.string().trim().max(80).optional().or(z.literal("")),
  commPreference: z.enum(["email", "sms", "both", "none"]).default("email"),
  status: z.enum(["prospect", "active", "alumni"]).default("active"),
  shirtSize: z.string().trim().max(20).optional().or(z.literal("")),
  dietaryFlags: z.string().trim().max(400).optional().or(z.literal("")),
  // Comma-separated list of Member IDs to link as parents/guardians.
  // The UI sends these from a checkbox group on the form so sibling
  // registrations don't retype the same parents.
  parentIds: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type MemberState = { error?: string; ok?: true } | null;

function vaultMissing(org: { encryptedDek: Buffer | Uint8Array | null }): boolean {
  return !org.encryptedDek;
}

export async function upsertMember(_prev: MemberState, formData: FormData): Promise<MemberState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = MemberInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  if (vaultMissing(auth.org)) {
    return { error: "Org encryption vault is not provisioned. Re-create the org or restore from recovery." };
  }
  const dek = unwrapDekWithMaster(auth.org);
  const d = parsed.data;
  const enc = encryptMemberPii(
    {
      firstName: d.firstName,
      lastName: d.lastName,
      phone: d.phone?.trim() || null,
      street: d.street?.trim() || null,
      city: d.city?.trim() || null,
      state: d.state?.trim() || null,
      zip: d.zip?.trim() || null,
    },
    dek,
    auth.org.id,
  );
  const data = {
    orgId: auth.org.id,
    encFirstName: enc.encFirstName,
    encLastName: enc.encLastName,
    encPhone: enc.encPhone,
    encStreet: enc.encStreet,
    encCity: enc.encCity,
    encState: enc.encState,
    encZip: enc.encZip,
    lastNameLc1: enc.lastNameLc1,
    email: d.email?.trim() || null,
    isYouth: d.isYouth === "on",
    patrol: d.patrol?.trim() || null,
    position: d.position?.trim() || null,
    commPreference: d.commPreference,
    status: d.status,
    shirtSize: d.shirtSize?.trim() || null,
    dietaryFlags: (d.dietaryFlags ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    parentIds: (d.parentIds ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8),
  };
  if (d.id) {
    const existing = await prisma.member.findUnique({ where: { id: d.id } });
    if (!existing || existing.orgId !== auth.org.id) return { error: "Member not found." };
    await prisma.member.update({ where: { id: existing.id }, data });
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "Member",
      entityId: existing.id,
      action: "update",
      summary: `Updated ${d.firstName} ${d.lastName}`,
    });
  } else {
    const created = await prisma.member.create({ data });
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "Member",
      entityId: created.id,
      action: "create",
      summary: `Added ${d.firstName} ${d.lastName}`,
    });
  }
  revalidatePath(`/o/${auth.org.slug}/admin/members`);
  redirect(`/o/${auth.org.slug}/admin/members`);
}

const RemoveSchema = z.object({ orgSlug: z.string().min(1), id: z.string().min(1) });

async function describeMember(
  m: Parameters<typeof decryptMemberPii>[0] & { id: string },
  dek: Buffer,
  orgId: string,
): Promise<string> {
  try {
    const d = decryptMemberPii(m, dek, orgId);
    const name = [d.firstName, d.lastName].filter(Boolean).join(" ");
    return name || m.id;
  } catch {
    return m.id;
  }
}

export async function softDeleteMember(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = RemoveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const m = await prisma.member.findUnique({ where: { id: parsed.data.id } });
  if (!m || m.orgId !== auth.org.id) return { error: "Member not found." };
  await prisma.member.update({
    where: { id: m.id },
    data: { deletedAt: new Date() },
  });
  let summary = `Removed ${m.id}`;
  if (!vaultMissing(auth.org)) {
    const dek = unwrapDekWithMaster(auth.org);
    summary = `Removed ${await describeMember(m, dek, auth.org.id)}`;
  }
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Member",
    entityId: m.id,
    action: "delete",
    summary,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/members`);
  return { ok: true as const };
}

export async function restoreMember(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = RemoveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const m = await prisma.member.findUnique({ where: { id: parsed.data.id } });
  if (!m || m.orgId !== auth.org.id) return { error: "Member not found." };
  await prisma.member.update({
    where: { id: m.id },
    data: { deletedAt: null },
  });
  let summary = `Restored ${m.id}`;
  if (!vaultMissing(auth.org)) {
    const dek = unwrapDekWithMaster(auth.org);
    summary = `Restored ${await describeMember(m, dek, auth.org.id)}`;
  }
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Member",
    entityId: m.id,
    action: "update",
    summary,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/members`);
  return { ok: true as const };
}
