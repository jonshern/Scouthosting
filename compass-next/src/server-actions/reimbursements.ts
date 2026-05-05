"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";

const STATUSES = new Set(["pending", "approved", "denied", "paid"]);

export async function setReimbursementStatus(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const { user } = await getSession();
  if (!user) redirect("/login");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.has(status)) throw new Error("Bad status.");

  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) throw new Error("Org not found.");
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) throw new Error("Forbidden.");

  const row = await prisma.reimbursement.findFirst({
    where: { id, orgId: org.id },
    select: { id: true },
  });
  if (!row) throw new Error("Not found.");

  await prisma.reimbursement.update({
    where: { id },
    data: { status },
  });
  redirect(`/o/${orgSlug}/admin/reimbursements`);
}
