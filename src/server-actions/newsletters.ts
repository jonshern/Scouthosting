"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";

const ScheduleSchema = z.object({
  orgSlug: z.string().min(1),
  paused: z.string().optional(),
  weekday: z.coerce.number().int().min(1).max(7),
  localTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  timezone: z.string().min(1).max(80),
  minStories: z.coerce.number().int().min(0).max(20),
});

export async function saveNewsletterSchedule(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const { user } = await getSession();
  if (!user) redirect("/login");
  const parsed = ScheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");

  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org) throw new Error("Org not found.");
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    throw new Error("Forbidden.");
  }

  const data = {
    paused: parsed.data.paused === "on",
    weekday: parsed.data.weekday,
    localTime: parsed.data.localTime,
    timezone: parsed.data.timezone,
    minStories: parsed.data.minStories,
  };
  await prisma.newsletterSchedule.upsert({
    where: { orgId: org.id },
    create: { orgId: org.id, ...data },
    update: data,
  });
  redirect(`/o/${parsed.data.orgSlug}/admin/newsletters?saved=1`);
}
