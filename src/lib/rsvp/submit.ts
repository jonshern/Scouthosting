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

export type RsvpInput = { response: "yes" | "no" | "maybe"; guests: number; notes: string | null };

export async function submitOwnRsvp(
  user: { id: string; email: string; displayName: string },
  event: { id: string; orgId: string },
  input: RsvpInput,
) {
  const data = { response: input.response, guests: input.guests, notes: input.notes || null };

  // The roster entry this user is, so a paid event charges the same
  // family account as an RSVP on the website does.
  const memberId = await memberForUserInOrg({ orgId: event.orgId, userEmail: user.email });

  // Rsvp is unique on (eventId, userId) and on (eventId, email): an
  // RSVP made earlier from the public link with this email is the
  // same person, so adopt it rather than tripping the constraint.
  const findExisting = async () =>
    (await prisma.rsvp.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: user.id } },
      select: { id: true, memberId: true },
    })) ??
    (await prisma.rsvp.findFirst({
      where: {
        eventId: event.id,
        email: { equals: user.email, mode: "insensitive" },
        userId: null,
      },
      select: { id: true, memberId: true },
    }));
  const update = (row: { id: string; memberId: string | null }) =>
    prisma.rsvp.update({
      where: { id: row.id },
      data: { ...data, userId: user.id, memberId: row.memberId ?? memberId },
    });
  const existing = await findExisting();
  let rsvp;
  if (existing) {
    rsvp = await update(existing);
  } else {
    try {
      rsvp = await prisma.rsvp.create({
        data: {
          orgId: event.orgId,
          eventId: event.id,
          userId: user.id,
          memberId,
          name: user.displayName,
          email: user.email,
          ...data,
        },
      });
    } catch (err) {
      // A double-tap: the other request created it a moment ago.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      const row = await findExisting();
      if (!row) throw err;
      rsvp = await update(row);
    }
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
