"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { type Plan } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";

const PLANS = new Set<Plan>(["patrol", "troop", "council"]);

async function authorizeSuper() {
  const { user } = await getSession();
  if (!user || !user.isSuperAdmin) throw new Error("Forbidden.");
  return user;
}

const SuspendSchema = z.object({
  orgId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
});

export async function suspendOrgAction(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const user = await authorizeSuper();
  const parsed = SuspendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");

  const org = await prisma.org.findUnique({
    where: { id: parsed.data.orgId },
    select: { slug: true },
  });
  if (!org) throw new Error("Org not found.");

  await prisma.org.update({
    where: { id: parsed.data.orgId },
    data: { suspendedAt: new Date(), suspendedReason: parsed.data.reason },
  });
  audit({
    orgId: parsed.data.orgId,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "Org",
    entityId: parsed.data.orgId,
    action: "org.suspend",
    summary: parsed.data.reason,
  });
  redirect(`/super-admin/orgs/${org.slug}`);
}

const RestoreSchema = z.object({ orgId: z.string().min(1) });

export async function restoreOrgAction(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const user = await authorizeSuper();
  const parsed = RestoreSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid input.");

  const org = await prisma.org.findUnique({
    where: { id: parsed.data.orgId },
    select: { slug: true },
  });
  if (!org) throw new Error("Org not found.");

  await prisma.org.update({
    where: { id: parsed.data.orgId },
    data: { suspendedAt: null, suspendedReason: null },
  });
  audit({
    orgId: parsed.data.orgId,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "Org",
    entityId: parsed.data.orgId,
    action: "org.restore",
  });
  redirect(`/super-admin/orgs/${org.slug}`);
}

const ChangePlanSchema = z.object({
  orgId: z.string().min(1),
  plan: z.string().min(1),
});

export async function changeOrgPlanAction(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const user = await authorizeSuper();
  const parsed = ChangePlanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid input.");
  if (!PLANS.has(parsed.data.plan as Plan)) throw new Error("Bad plan.");

  const org = await prisma.org.findUnique({
    where: { id: parsed.data.orgId },
    select: { slug: true, plan: true },
  });
  if (!org) throw new Error("Org not found.");

  await prisma.org.update({
    where: { id: parsed.data.orgId },
    data: { plan: parsed.data.plan as Plan },
  });
  audit({
    orgId: parsed.data.orgId,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "Org",
    entityId: parsed.data.orgId,
    action: "org.plan_change",
    summary: `${org.plan} → ${parsed.data.plan}`,
  });
  redirect(`/super-admin/orgs/${org.slug}`);
}
