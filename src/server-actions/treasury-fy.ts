"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/treasury/money";

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

export type FyState = { ok?: true; error?: string; id?: string } | null;

const FySchema = z.object({
  orgSlug: z.string().min(1),
  id: z.string().optional(),
  label: z.string().trim().min(1).max(40),
  startsOn: z.string().min(1),
  endsOn: z.string().min(1),
  closed: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function upsertFiscalYear(
  _prev: FyState,
  formData: FormData,
): Promise<FyState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = FySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;
  const startsOn = new Date(d.startsOn);
  const endsOn = new Date(d.endsOn);
  if (endsOn <= startsOn) return { error: "End date must be after start date." };
  const data = {
    orgId: auth.org.id,
    label: d.label,
    startsOn,
    endsOn,
    closedAt: d.closed === "on" ? new Date() : null,
  };
  if (d.id) {
    const existing = await prisma.fiscalYear.findUnique({ where: { id: d.id } });
    if (!existing || existing.orgId !== auth.org.id) return { error: "Fiscal year not found." };
    await prisma.fiscalYear.update({ where: { id: existing.id }, data });
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "FiscalYear",
      entityId: existing.id,
      action: "update",
      summary: `Updated FY ${d.label}`,
    });
    revalidatePath(`/o/${auth.org.slug}/admin/treasury/fiscal-years`);
    return { ok: true, id: existing.id };
  }
  const created = await prisma.fiscalYear.create({ data });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "FiscalYear",
    entityId: created.id,
    action: "create",
    summary: `Created FY ${d.label}`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/treasury/fiscal-years`);
  return { ok: true, id: created.id };
}

const BudgetSchema = z.object({
  orgSlug: z.string().min(1),
  fiscalYearId: z.string().min(1),
  fundId: z.string().min(1),
  expected: z.string().min(1),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function upsertBudget(
  _prev: FyState,
  formData: FormData,
): Promise<FyState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = BudgetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;
  const fy = await prisma.fiscalYear.findUnique({ where: { id: d.fiscalYearId } });
  if (!fy || fy.orgId !== auth.org.id) return { error: "Fiscal year not found." };
  const fund = await prisma.fund.findUnique({ where: { id: d.fundId } });
  if (!fund || fund.orgId !== auth.org.id) return { error: "Fund not found." };

  const cents = dollarsToCents(d.expected);
  await prisma.fundBudget.upsert({
    where: {
      fiscalYearId_fundId: { fiscalYearId: fy.id, fundId: fund.id },
    },
    create: {
      orgId: auth.org.id,
      fiscalYearId: fy.id,
      fundId: fund.id,
      expectedCents: cents,
      notes: d.notes?.trim() || null,
    },
    update: {
      expectedCents: cents,
      notes: d.notes?.trim() || null,
    },
  });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "FundBudget",
    entityId: `${fy.id}:${fund.id}`,
    action: "update",
    summary: `Set ${fund.name} budget to ${(cents / 100).toFixed(2)} for ${fy.label}`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/treasury/fiscal-years/${fy.id}`);
  return { ok: true };
}
