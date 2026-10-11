// POST /api/v1/events/[id]/rsvp — submit an RSVP for the
// authenticated user. Body: { response?, guests?, notes? }.

import { z } from "zod";
import { prisma } from "@/lib/db";
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

    // Rsvp is unique on (eventId, userId) and on (eventId, email): an
    // RSVP made earlier from the public link with this email is the
    // same person, so adopt it rather than tripping the constraint.
    const existing =
      (await prisma.rsvp.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
        select: { id: true },
      })) ??
      (await prisma.rsvp.findFirst({
        where: {
          eventId: event.id,
          email: { equals: user.email, mode: "insensitive" },
          userId: null,
        },
        select: { id: true },
      }));
    const rsvp = existing
      ? await prisma.rsvp.update({
          where: { id: existing.id },
          data: { ...data, userId: user.id },
        })
      : await prisma.rsvp.create({
          data: {
            orgId: event.orgId,
            eventId: event.id,
            userId: user.id,
            name: user.displayName,
            email: user.email,
            ...data,
          },
        });
    // Families channels follow yes/maybe RSVPs.
    await reconcileEventChannels(event.id, { prismaClient: prisma });
    return json({ rsvp: { id: rsvp.id, response: rsvp.response, guests: rsvp.guests } });
  },
  { limits: [LIMITS.rsvp] },
);
