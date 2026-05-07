"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";

const Schema = z.object({
  orgSlug: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
});

export async function createAnnouncement(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };

  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };

  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org) return { error: "Site not found." };

  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };

  await prisma.announcement.create({
    data: {
      orgId: org.id,
      authorId: user.id,
      title: parsed.data.title,
      body: parsed.data.body,
    },
  });
  revalidatePath(`/o/${org.slug}`);
  revalidatePath(`/o/${org.slug}/admin/announcements`);
  // Bust the public announcements API cache so the homepage widget
  // picks up the new entry on its next fetch.
  updateTag("public-announcements");
  return { ok: true as const };
}
