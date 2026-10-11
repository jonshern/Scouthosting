"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { claimSlot, releaseSlot } from "@/lib/slots";
import { reconcileEventChannels } from "@/lib/chat";

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
    select: { id: true, eventId: true },
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

  // Families channels include everyone who took a slot.
  await reconcileEventChannels(slot.eventId, { prismaClient: prisma });
  revalidatePath(`/o/${org.slug}/calendar`);
  return { ok: true, waitlisted };
}

/**
 * Release a slot assignment. Only the user who claimed it (matching
 * by userId for signed-in or by email for anonymous guest claims) can
 * release. Promotes waitlisters oldest-first in the same transaction.
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
    select: { id: true, eventId: true },
  });
  if (!slot) return { error: "Slot not found." };

  const { user } = await getSession();
  let who: { userId: string } | { guestEmail: string };
  if (user) {
    who = { userId: user.id };
  } else {
    const email = (d.email ?? "").trim().toLowerCase();
    if (!email) return { error: "Email is required to release as a guest." };
    who = { guestEmail: email };
  }

  await prisma.$transaction((tx) => releaseSlot(tx, { slotId: slot.id, who }));
  await reconcileEventChannels(slot.eventId, { prismaClient: prisma });

  revalidatePath(`/o/${org.slug}/calendar`);
  return { ok: true, released: true };
}
