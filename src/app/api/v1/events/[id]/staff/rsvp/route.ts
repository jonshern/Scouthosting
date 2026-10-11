// POST /api/v1/events/:id/staff/rsvp — a staffer answers for
// themselves. Any signed-in user whose staff row on this event is
// linked to them, or (verified email) carries their address; the
// first answer links the row to their account. Staff don't have to
// belong to the event's org (counselors often come from elsewhere).
// Body: { status: "yes" | "no" | "maybe", notes? }.

import { prisma } from "@/lib/db";
import { ApiError, LIMITS, json, notFound, parseId, readJson, v1Route } from "@/lib/api/v1";
import { loadVerifiedUser } from "@/lib/api/v1-events";
import { StaffRsvpSchema, respondAsUser } from "@/lib/events/staff";

export const runtime = "nodejs";

export const POST = v1Route<{ id: string }>(
  async (req, { user, params }) => {
    const id = parseId(params.id);
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, org: { select: { suspendedAt: true } } },
    });
    if (!event) throw notFound();
    if (event.org.suspendedAt) throw new ApiError(423, "org_suspended");
    const input = await readJson(req, StaffRsvpSchema);
    const staff = await respondAsUser(event.id, await loadVerifiedUser(user), input.status, input.notes);
    return json({ staff });
  },
  { limits: [LIMITS.rsvp] },
);
