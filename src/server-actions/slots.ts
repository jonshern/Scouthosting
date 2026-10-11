"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { claimSlot, releaseSlot } from "@/lib/slots";
import { notifyPromoted } from "@/lib/slots/notify";

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
});

export type SlotActionState =
  | { error?: string; ok?: true; waitlisted?: boolean; released?: boolean }
  | null;

/**
 * Take a sign-up slot (drivers, food, gear). Anyone can claim — login
 * is optional. Capacity is enforced under a row lock on the slot (see
 * lib/slots) so two simultaneous claims can't oversubscribe. When a slot is full and
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
    select: { id: true },
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
    const r = await prisma.$transaction((tx) =>
      claimSlot(tx, {
        orgId: org.id,
        slotId: slot.id,
        userId: user?.id ?? null,
        name,
        email,
        notes,
      }),
    );
    waitlisted = r.waitlisted;
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
 * Release a slot assignment. Only the signed-in user who claimed it
 * can release. Promotes waitlisters oldest-first in the same transaction.
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

  // Signed-in only. Releasing by a typed email would let anyone who
  // knows a guest's address drop their claim; guests ask the organizer.
  const { user } = await getSession();
  if (!user) return { error: "Sign in to release a slot, or ask the event organizer." };

  const r = await prisma.$transaction((tx) =>
    releaseSlot(tx, { slotId: slot.id, who: { userId: user.id } }),
  );
  await notifyPromoted(r.promotedIds);

  revalidatePath(`/o/${org.slug}/calendar`);
  return { ok: true, released: true };
}
