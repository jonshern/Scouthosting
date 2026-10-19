"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { reconcileEventChannels } from "@/lib/chat";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import {
  memberForUserInOrg,
  settleEventChargeForRsvp,
} from "@/lib/treasury/event-charge";
import { EventFullError, assertRsvpFits, fullMessage } from "@/lib/rsvp/capacity";

const RsvpSchema = z.object({
  orgSlug: z.string().min(1),
  eventId: z.string().min(1),
  response: z.enum(["yes", "no", "maybe"]).default("yes"),
  guests: z.string().optional(),
  notes: z.string().max(1000).optional().or(z.literal("")),
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
});

export async function submitRsvp(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = RsvpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  const org = await prisma.org.findUnique({ where: { slug: d.orgSlug } });
  if (!org) return { error: "Site not found." };

  const event = await prisma.event.findUnique({ where: { id: d.eventId } });
  if (!event || event.orgId !== org.id) return { error: "Event not found." };

  const { user } = await getSession();
  const guests = parseInt(d.guests ?? "0", 10) || 0;

  let memberId: string | null = null;
  try {
    if (user) {
      // Confirmed email only: an account made with a roster parent's
      // address must not post charges on that family's account.
      memberId = user.emailVerified ? await memberForUserInOrg({ orgId: org.id, userEmail: user.email }) : null;
      const linkTo = memberId;
      await prisma.$transaction(async (tx) => {
        const existing = await tx.rsvp.findFirst({
          where: { eventId: d.eventId, userId: user.id },
          select: { id: true, memberId: true },
        });
        await assertRsvpFits(tx, { eventId: d.eventId, existingId: existing?.id ?? null, response: d.response, guests });
        if (existing) {
          await tx.rsvp.update({
            where: { id: existing.id },
            data: {
              response: d.response,
              guests,
              notes: d.notes || null,
              memberId: existing.memberId ?? linkTo ?? null,
            },
          });
        } else {
          await tx.rsvp.create({
            data: {
              orgId: org.id,
              eventId: d.eventId,
              userId: user.id,
              memberId: linkTo,
              name: user.displayName,
              email: user.email,
              response: d.response,
              guests,
              notes: d.notes || null,
            },
          });
        }
      });
    } else {
      if (!d.name || !d.email) return { error: "Name and email are required when not signed in." };
      const email = d.email.toLowerCase();
      const name = d.name;
      // An unverified, typed-in email doesn't get linked to a roster
      // member: otherwise anyone could post (or reverse) an event charge
      // on another family's account. memberId stays null for guests.
      try {
        await prisma.$transaction(async (tx) => {
          await assertRsvpFits(tx, { eventId: d.eventId, existingId: null, response: d.response, guests });
          await tx.rsvp.create({
            data: {
              orgId: org.id,
              eventId: d.eventId,
              name,
              email,
              response: d.response,
              guests,
              notes: d.notes || null,
            },
          });
        });
      } catch (err) {
        // Guests can't overwrite an RSVP by typing someone's email; they
        // change theirs from the emailed RSVP link or by signing in.
        if ((err as { code?: string }).code === "P2002") {
          return {
            error:
              "There's already an RSVP for this email. Use the link in your RSVP email or sign in to change it.",
          };
        }
        throw err;
      }
    }
  } catch (err) {
    if (err instanceof EventFullError) return { error: fullMessage(err) };
    throw err;
  }

  if (memberId) {
    try {
      await settleEventChargeForRsvp({
        orgId: org.id,
        eventId: d.eventId,
        memberId,
        response: d.response,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("event-charge settlement failed", err);
    }
  }

  await reconcileEventChannels(d.eventId, { prismaClient: prisma });
  revalidatePath(`/o/${org.slug}/calendar`);
  return { ok: true as const };
}
