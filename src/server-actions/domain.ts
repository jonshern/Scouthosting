"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";

const DomainSchema = z.object({
  orgSlug: z.string().min(1),
  domain: z
    .string()
    .trim()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, {
      message: "Must be a valid domain (no scheme, no path).",
    }),
});

async function authorize(orgSlug: string) {
  const { user } = await getSession();
  if (!user) throw new Error("Sign in.");
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) throw new Error("Org not found.");
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    throw new Error("Forbidden.");
  }
  return org;
}

export async function setCustomDomain(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const parsed = DomainSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");
  const org = await authorize(parsed.data.orgSlug);

  const domain = parsed.data.domain.toLowerCase();
  // Reject collisions across orgs.
  const conflict = await prisma.org.findFirst({
    where: { customDomain: domain, NOT: { id: org.id } },
    select: { id: true },
  });
  if (conflict) throw new Error("That domain is already in use by another org.");

  await prisma.org.update({
    where: { id: org.id },
    data: { customDomain: domain },
  });
  redirect(`/o/${parsed.data.orgSlug}/admin/domain?saved=1`);
}

export async function clearCustomDomain(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const org = await authorize(orgSlug);
  await prisma.org.update({
    where: { id: org.id },
    data: { customDomain: null },
  });
  redirect(`/o/${orgSlug}/admin/domain`);
}
