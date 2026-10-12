// POST /api/v1/events/[id]/rsvp — submit an RSVP for the
// authenticated user. Body: { response?, guests?, notes? }.

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/log";
import { memberForUserInOrg, settleEventChargeForRsvp } from "@/lib/treasury/event-charge";
import { reconcileEventChannels } from "@/lib/chat";
import {
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
  guests: z.number().int().min(0).max(20).default(0),
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
    return json({ rsvp: { id: rsvp.id, response: rsvp.response, guests: rsvp.guests } });
  },
  { limits: [LIMITS.rsvp] },
);
