// POST /api/v1/events/[id]/rsvp — submit an RSVP for the
// authenticated user. Body: { response?, guests?, notes? }. Leaving out
// guests or notes keeps what's already on the RSVP (a phone tap on
// "Going" shouldn't wipe the notes entered on the website).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { EventFullError } from "@/lib/rsvp/capacity";
import { submitOwnRsvp } from "@/lib/rsvp/submit";
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
    let rsvp;
    try {
      rsvp = await submitOwnRsvp(user, event, input);
    } catch (err) {
      if (err instanceof EventFullError) {
        throw new ApiError(409, "event_full", { spotsLeft: err.spotsLeft });
      }
      throw err;
    }
    return json({ rsvp: { id: rsvp.id, response: rsvp.response, guests: rsvp.guests, notes: rsvp.notes } });
  },
  { limits: [LIMITS.rsvp] },
);
