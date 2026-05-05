"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";

const TakeSchema = z.object({
  orgSlug: z.string().min(1),
  slotId: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  notes: z.string().max(200).optional().or(z.literal("")),
});

const ReleaseSchema = z.object({
  orgSlug: z.string().min(1),
  slotId: z.string().min(1),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
});

export type SlotActionState =
  | { error?: string; ok?: true; waitlisted?: boolean; released?: boolean }
  | null;

/**
 * Take a sign-up slot (drivers, food, gear). Anyone can claim — login
 * is optional. Capacity is enforced inside a transaction so two
 * simultaneous claims can't oversubscribe. When a slot is full and
 * waitlisting is allowed, additional claims queue; auto-promoted on
 * release in `releaseSlotAssignment`.
 */
export async function takeSlot(
  _prev: SlotActionState,
  formData: FormData,
): Promise<SlotActionState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) {
    return { error: "Bad CSRF token." };
  }
  const parsed = TakeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  const org = await prisma.org.findUnique({ where: { slug: d.orgSlug } });
  if (!org) return { error: "Site not found." };

  const slot = await prisma.signupSlot.findFirst({
    where: { id: d.slotId, orgId: org.id },
    select: { id: true, capacity: true, allowWaitlist: true, eventId: true },
  });
  if (!slot) return { error: "Slot not found." };

  const { user } = await getSession();
  const name = user?.displayName ?? d.name ?? "";
  const email = (user?.email ?? d.email ?? "").trim().toLowerCase() || null;
  const notes = (d.notes ?? "").trim().slice(0, 200) || null;

  if (!name) return { error: "Name is required." };
  if (!user && !email) return { error: "Email is required when not signed in." };

  let waitlisted = false;
  try {
    await prisma.$transaction(async (tx) => {
      const activeCount = await tx.slotAssignment.count({
        where: { slotId: slot.id, waitlisted: false },
      });
      if (activeCount >= slot.capacity) {
        if (!slot.allowWaitlist) {
          const err = new Error("FULL") as Error & { code?: string };
          err.code = "FULL";
          throw err;
        }
        waitlisted = true;
      }
      await tx.slotAssignment.create({
        data: {
          orgId: org.id,
          slotId: slot.id,
          userId: user?.id ?? null,
          name,
          email,
          notes,
          waitlisted,
        },
      });
    });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "FULL") return { error: "This slot is full." };
    if (err.code === "P2002") return { error: "You're already signed up for this slot." };
    throw e;
  }

  revalidatePath(`/o/${org.slug}/calendar`);
  return { ok: true, waitlisted };
}

/**
 * Release a slot assignment. Only the user who claimed it (matching
 * by userId for signed-in or by email for anonymous) can release.
 * Promotes the oldest waitlisted assignment in the same transaction
 * if the released row was active.
 */
export async function releaseSlotAssignment(
  _prev: SlotActionState,
  formData: FormData,
): Promise<SlotActionState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) {
    return { error: "Bad CSRF token." };
  }
  const parsed = ReleaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  const org = await prisma.org.findUnique({ where: { slug: d.orgSlug } });
  if (!org) return { error: "Site not found." };

  const slot = await prisma.signupSlot.findFirst({
    where: { id: d.slotId, orgId: org.id },
    select: { id: true },
  });
  if (!slot) return { error: "Slot not found." };

  const { user } = await getSession();
  const where: { slotId: string; userId?: string; email?: string } = { slotId: slot.id };
  if (user) {
    where.userId = user.id;
  } else {
    const email = (d.email ?? "").trim().toLowerCase();
    if (!email) return { error: "Email is required to release as a guest." };
    where.email = email;
  }

  await prisma.$transaction(async (tx) => {
    const target = await tx.slotAssignment.findFirst({ where });
    if (!target) return;
    await tx.slotAssignment.delete({ where: { id: target.id } });
    if (!target.waitlisted) {
      const nextUp = await tx.slotAssignment.findFirst({
        where: { slotId: slot.id, waitlisted: true },
        orderBy: { createdAt: "asc" },
      });
      if (nextUp) {
        await tx.slotAssignment.update({
          where: { id: nextUp.id },
          data: { waitlisted: false },
        });
      }
    }
  });

  revalidatePath(`/o/${org.slug}/calendar`);
  return { ok: true, released: true };
}
