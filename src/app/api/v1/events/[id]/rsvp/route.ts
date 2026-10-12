// POST /api/v1/events/[id]/rsvp — submit an RSVP for the
// authenticated user. Body: { response?, guests?, notes? }. Leaving out
// guests or notes keeps what's already on the RSVP (a phone tap on
// "Going" shouldn't wipe the notes entered on the website).

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/log";
import { memberForUserInOrg, settleEventChargeForRsvp } from "@/lib/treasury/event-charge";
import { reconcileEventChannels } from "@/lib/chat";
import { EventFullError, assertRsvpFits } from "@/lib/rsvp/capacity";
import {
  ApiError,
  LIMITS,
  json,
  notFound,
  parseId,
  readJson,
  requireOrgAccessForResource,
  v1Route,
} from "@/lib/api/v1";

export const runtime = "nodejs";

const Body = z.object({
  response: z.enum(["yes", "no", "maybe"], { message: "bad_response" }).default("yes"),
  guests: z.number().int().min(0).max(20).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const POST = v1Route<{ id: string }>(
  async (req, { user, params }) => {
    const id = parseId(params.id);
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, orgId: true },
    });
    if (!event) throw notFound();
    await requireOrgAccessForResource(event.orgId, user.id, { write: true });

    const input = await readJson(req, Body);
    const data = {
      response: input.response,
      ...(input.guests !== undefined ? { guests: input.guests } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
    };

    // The roster entry this user is, so a paid event charges the same
    // family account as an RSVP on the website does.
    const memberId = await memberForUserInOrg({ orgId: event.orgId, userEmail: user.email });

    // Rsvp is unique on (eventId, userId) and on (eventId, email): an
    // RSVP made earlier from the public link with this email is the
    // same person, so adopt it rather than tripping the constraint.
    const write = () =>
      prisma.$transaction(async (tx) => {
        const existing =
          (await tx.rsvp.findUnique({
            where: { eventId_userId: { eventId: event.id, userId: user.id } },
            select: { id: true, memberId: true },
          })) ??
          (await tx.rsvp.findFirst({
            where: {
              eventId: event.id,
              email: { equals: user.email, mode: "insensitive" },
              userId: null,
            },
            select: { id: true, memberId: true },
          }));
        await assertRsvpFits(tx, {
          eventId: event.id,
          existingId: existing?.id ?? null,
          response: input.response,
          guests: input.guests,
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
      try {
        rsvp = await write();
      } catch (err) {
        // A double-tap: the other request created it a moment ago, so
        // the retry finds and updates it.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
        rsvp = await write();
      }
    } catch (err) {
      if (err instanceof EventFullError) {
        throw new ApiError(409, "event_full", { spotsLeft: err.spotsLeft });
      }
      throw err;
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
    return json({ rsvp: { id: rsvp.id, response: rsvp.response, guests: rsvp.guests, notes: rsvp.notes } });
  },
  { limits: [LIMITS.rsvp] },
);
