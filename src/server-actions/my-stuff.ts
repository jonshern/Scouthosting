"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";

// Self-edit is intentionally narrow: skills, interests, dietaryFlags,
// shirtSize. Names + addresses go through the leader-managed roster
// page so they stay paired with the encryption flow + audit trail.

const Schema = z.object({
  memberId: z.string().min(1),
  skills: z.string().trim().max(2000).optional().or(z.literal("")),
  interests: z.string().trim().max(2000).optional().or(z.literal("")),
  dietaryFlags: z.string().trim().max(400).optional().or(z.literal("")),
  shirtSize: z.string().trim().max(20).optional().or(z.literal("")),
});

export type MyStuffState = { ok?: true; error?: string } | null;

function splitTags(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

export async function updateMyStuff(
  _prev: MyStuffState,
  formData: FormData,
): Promise<MyStuffState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };

  // Verify the target Member row belongs to *this* user, by email.
  const target = await prisma.member.findUnique({
    where: { id: parsed.data.memberId },
    select: { id: true, email: true, orgId: true, org: { select: { slug: true } } },
  });
  if (!target) return { error: "Member not found." };
  if ((target.email ?? "").toLowerCase() !== user.email.toLowerCase()) {
    return { error: "Not your roster row." };
  }

  await prisma.member.update({
    where: { id: target.id },
    data: {
      skills: splitTags(parsed.data.skills ?? ""),
      interests: splitTags(parsed.data.interests ?? ""),
      dietaryFlags: splitTags(parsed.data.dietaryFlags ?? ""),
      shirtSize: parsed.data.shirtSize?.trim() || null,
    },
  });

  revalidatePath("/account/my-stuff");
  if (target.org?.slug) {
    revalidatePath(`/o/${target.org.slug}/admin/members/${target.id}`);
    revalidatePath(`/o/${target.org.slug}/admin/reports`);
  }
  return { ok: true };
}
