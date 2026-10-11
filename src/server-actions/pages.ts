"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { isValidSlug } from "@/lib/validation/slug";
import { audit } from "@/lib/audit";

async function authorize(orgSlug: string) {
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." as const };
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) return { error: "Site not found." as const };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." as const };
  return { user, org };
}

const HeroInput = z.object({
  orgSlug: z.string().min(1),
  heroHeadline: z.string().trim().max(200).optional().or(z.literal("")),
  heroLede: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function saveHero(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = HeroInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorize(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const heroHeadline = parsed.data.heroHeadline?.trim() || null;
  const heroLede = parsed.data.heroLede?.trim() || null;
  await prisma.page.upsert({
    where: { orgId: auth.org.id },
    update: { heroHeadline, heroLede },
    create: { orgId: auth.org.id, heroHeadline, heroLede },
  });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Page",
    entityId: auth.org.id,
    action: "update",
    summary: "Updated hero",
  });
  revalidatePath(`/o/${auth.org.slug}`);
  revalidatePath(`/o/${auth.org.slug}/admin/site`);
  return { ok: true as const };
}

const CustomPageInput = z.object({
  orgSlug: z.string().min(1),
  id: z.string().optional(),
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(50_000),
  visibility: z.enum(["public", "members"]).default("public"),
  showInNav: z.union([z.literal("on"), z.literal("")]).optional(),
  sortOrder: z.string().optional(),
});

export async function upsertCustomPage(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = CustomPageInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorize(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;
  if (!isValidSlug(d.slug)) return { error: "Slug must be lowercase letters, digits, hyphens." };
  const sort = d.sortOrder ? parseInt(d.sortOrder, 10) : 0;
  const data = {
    orgId: auth.org.id,
    slug: d.slug,
    title: d.title,
    body: d.body,
    visibility: d.visibility,
    showInNav: d.showInNav === "on",
    sortOrder: Number.isFinite(sort) ? sort : 0,
  };
  const existing = d.id
    ? await prisma.customPage.findUnique({ where: { id: d.id } })
    : null;
  if (existing) {
    if (existing.orgId !== auth.org.id) return { error: "Page belongs to a different site." };
    await prisma.customPage.update({ where: { id: existing.id }, data });
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "CustomPage",
      entityId: existing.id,
      action: "update",
      summary: `Updated page “${d.title}”`,
    });
  } else {
    // unique constraint on (orgId, slug); friendly check
    const dup = await prisma.customPage.findUnique({
      where: { orgId_slug: { orgId: auth.org.id, slug: d.slug } },
    });
    if (dup) return { error: `A page with the slug "${d.slug}" already exists.` };
    const created = await prisma.customPage.create({ data });
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "CustomPage",
      entityId: created.id,
      action: "create",
      summary: `Created page “${d.title}”`,
    });
  }
  revalidatePath(`/o/${auth.org.slug}/admin/pages`);
  revalidatePath(`/o/${auth.org.slug}/p/${d.slug}`);
  redirect(`/o/${auth.org.slug}/admin/pages`);
}

const DeleteSchema = z.object({ orgSlug: z.string().min(1), id: z.string().min(1) });

export async function deleteCustomPage(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = DeleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorize(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const page = await prisma.customPage.findUnique({ where: { id: parsed.data.id } });
  if (!page || page.orgId !== auth.org.id) return { error: "Page not found." };
  await prisma.customPage.delete({ where: { id: page.id } });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "CustomPage",
    entityId: page.id,
    action: "delete",
    summary: `Deleted page “${page.title}”`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/pages`);
  return { ok: true as const };
}
