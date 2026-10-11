"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";

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

const ItemSchema = z.object({
  orgSlug: z.string().min(1),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(60).optional().or(z.literal("")),
  serialOrTag: z.string().trim().max(60).optional().or(z.literal("")),
  location: z.string().trim().max(120).optional().or(z.literal("")),
  condition: z.enum(["good", "fair", "needs-repair", "retired"]).default("good"),
  quantity: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type EquipmentState = { ok?: true; error?: string } | null;

export async function upsertEquipment(
  _prev: EquipmentState,
  formData: FormData,
): Promise<EquipmentState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = ItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;
  const data = {
    orgId: auth.org.id,
    name: d.name,
    category: d.category?.trim() || null,
    serialOrTag: d.serialOrTag?.trim() || null,
    location: d.location?.trim() || null,
    condition: d.condition,
    quantity: d.quantity ? Math.max(1, parseInt(d.quantity, 10) || 1) : 1,
    notes: d.notes?.trim() || null,
  };
  if (d.id) {
    const existing = await prisma.equipment.findUnique({ where: { id: d.id } });
    if (!existing || existing.orgId !== auth.org.id) return { error: "Item not found." };
    await prisma.equipment.update({ where: { id: existing.id }, data });
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "Equipment",
      entityId: existing.id,
      action: "update",
      summary: `Updated equipment ${d.name}`,
    });
  } else {
    const created = await prisma.equipment.create({ data });
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "Equipment",
      entityId: created.id,
      action: "create",
      summary: `Added equipment ${d.name}`,
    });
  }
  revalidatePath(`/o/${auth.org.slug}/admin/equipment`);
  return { ok: true };
}

const LoanSchema = z.object({
  orgSlug: z.string().min(1),
  equipmentId: z.string().min(1),
  memberId: z.string().min(1),
  dueAt: z.string().optional().or(z.literal("")),
  loanNotes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function loanEquipment(
  _prev: EquipmentState,
  formData: FormData,
): Promise<EquipmentState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = LoanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;

  const [eq, member] = await Promise.all([
    prisma.equipment.findUnique({ where: { id: d.equipmentId } }),
    prisma.member.findUnique({ where: { id: d.memberId } }),
  ]);
  if (!eq || eq.orgId !== auth.org.id) return { error: "Equipment not found." };
  if (!member || member.orgId !== auth.org.id) return { error: "Member not found." };

  await prisma.equipmentLoan.create({
    data: {
      orgId: auth.org.id,
      equipmentId: eq.id,
      memberId: member.id,
      dueAt: d.dueAt ? new Date(d.dueAt) : null,
      loanNotes: d.loanNotes?.trim() || null,
    },
  });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "EquipmentLoan",
    entityId: eq.id,
    action: "create",
    summary: `Loaned ${eq.name}`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/equipment`);
  return { ok: true };
}

const ReturnSchema = z.object({
  orgSlug: z.string().min(1),
  loanId: z.string().min(1),
  returnNotes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function returnEquipment(
  _prev: EquipmentState,
  formData: FormData,
): Promise<EquipmentState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = ReturnSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };

  const loan = await prisma.equipmentLoan.findUnique({
    where: { id: parsed.data.loanId },
    include: { equipment: true },
  });
  if (!loan || loan.orgId !== auth.org.id) return { error: "Loan not found." };
  if (loan.returnedAt) return { error: "Loan already returned." };

  await prisma.equipmentLoan.update({
    where: { id: loan.id },
    data: {
      returnedAt: new Date(),
      returnNotes: parsed.data.returnNotes?.trim() || null,
    },
  });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "EquipmentLoan",
    entityId: loan.id,
    action: "update",
    summary: `Returned ${loan.equipment.name}`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/equipment`);
  return { ok: true };
}
