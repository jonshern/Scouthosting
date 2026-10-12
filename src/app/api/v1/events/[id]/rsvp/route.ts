// POST /api/v1/events/[id]/rsvp — submit an RSVP for the
// authenticated user. Body: { response?, guests?, notes? }.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { submitOwnRsvp } from "@/lib/rsvp/submit";
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
    const rsvp = await submitOwnRsvp(user, event, {
      response: input.response,
      guests: input.guests,
      notes: input.notes || null,
    });
    return json({ rsvp: { id: rsvp.id, response: rsvp.response, guests: rsvp.guests } });
  },
  { limits: [LIMITS.rsvp] },
);
