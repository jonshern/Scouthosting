// A signed-in adult's own RSVP to an event: one row per (event, user),
// adopting an earlier email-link RSVP from the same address, then the
// event's charge and families channels follow the answer. Used by
// POST /api/v1/events/:id/rsvp and the Claude connector's rsvp tool.
// The caller checks the user belongs to the event's org.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/log";
import { memberForUserInOrg, settleEventChargeForRsvp } from "@/lib/treasury/event-charge";
import { reconcileEventChannels } from "@/lib/chat";
import { assertRsvpFits } from "@/lib/rsvp/capacity";

/** Leaving out guests or notes keeps what's already on the RSVP. */
export type RsvpInput = { response: "yes" | "no" | "maybe"; guests?: number; notes?: string | null };

export async function submitOwnRsvp(
  user: { id: string; email: string; displayName: string },
  event: { id: string; orgId: string },
  input: RsvpInput,
) {
  const data = {
    response: input.response,
    ...(input.guests !== undefined ? { guests: input.guests } : {}),
    ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
  };

  // The roster entry this user is, so a paid event charges the same
  // family account as an RSVP on the website does. Only for a confirmed
  // email: anyone can sign up with a roster parent's address, and must
  // not post (or reverse) charges on that family's account.
  const verified = (await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } }))
    ?.emailVerified;
  const memberId = verified ? await memberForUserInOrg({ orgId: event.orgId, userEmail: user.email }) : null;

  // Rsvp is unique on (eventId, userId) and on (eventId, email): an
  // RSVP made earlier from the public link with this email is the
  // same person, so adopt it rather than tripping the constraint.
  // A full event throws EventFullError (lib/rsvp/capacity.ts).
  const write = () =>
    prisma.$transaction(async (tx) => {
      const existing =
        (await tx.rsvp.findUnique({
          where: { eventId_userId: { eventId: event.id, userId: user.id } },
          select: { id: true, memberId: true, guests: true },
        })) ??
        (await tx.rsvp.findFirst({
          where: {
            eventId: event.id,
            email: { equals: user.email, mode: "insensitive" },
            userId: null,
          },
          select: { id: true, memberId: true, guests: true },
        }));
      await assertRsvpFits(tx, {
        eventId: event.id,
        existingId: existing?.id ?? null,
        response: input.response,
        guests: input.guests ?? existing?.guests ?? 0,
      });
      if (existing) {
        return tx.rsvp.update({
          where: { id: existing.id },
          data: { ...data, userId: user.id, memberId: existing.memberId ?? memberId },
        });
      }
      return tx.rsvp.create({
        data: {
          orgId: event.orgId,
          eventId: event.id,
          userId: user.id,
          memberId,
          name: user.displayName,
          email: user.email,
          guests: 0,
          ...data,
        },
      });
    });
  let rsvp;
  try {
    rsvp = await write();
  } catch (err) {
    // A double-tap: the other request created it a moment ago, so
    // the retry finds and updates it.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    rsvp = await write();
  }
  const chargeMember = rsvp.memberId;
  if (chargeMember) {
    try {
      await settleEventChargeForRsvp({
        orgId: event.orgId,
        eventId: event.id,
        memberId: chargeMember,
        response: input.response,
      });
    } catch (err) {
      logger.child("rsvp").error("event-charge settlement failed", {
        eventId: event.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  // Families channels follow yes/maybe RSVPs.
  await reconcileEventChannels(event.id, { prismaClient: prisma });
  return rsvp;
}
