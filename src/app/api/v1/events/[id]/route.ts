// GET /api/v1/events/[id] — single event detail with RSVP summary.
// Only aggregate counts leave the server: other families' names and
// slot sign-ups stay private.

import { prisma } from "@/lib/db";
import { json, notFound, parseId, requireOrgAccessForResource, v1Route } from "@/lib/api/v1";

export const runtime = "nodejs";

function seatOf(
  assignments: { userId: string | null; waitlisted: boolean }[],
  userId: string,
): "active" | "waitlisted" | null {
  const mine = assignments.find((a) => a.userId === userId);
  return mine ? (mine.waitlisted ? "waitlisted" : "active") : null;
}

export const GET = v1Route<{ id: string }>(async (_req, { user, params }) => {
  const id = parseId(params.id);
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      rsvps: {
        select: { id: true, userId: true, response: true, guests: true },
      },
      slots: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { assignments: { select: { waitlisted: true, userId: true } } },
      },
    },
  });
  if (!event) throw notFound();
  await requireOrgAccessForResource(event.orgId, user.id);

  const myRsvp = event.rsvps.find((r) => r.userId === user.id);
  return json({
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      location: event.location,
      locationAddress: event.locationAddress,
      category: event.category,
      signupRequired: event.signupRequired,
      rrule: event.rrule,
      rsvpSummary: {
        yes: event.rsvps.filter((r) => r.response === "yes").length,
        no: event.rsvps.filter((r) => r.response === "no").length,
        maybe: event.rsvps.filter((r) => r.response === "maybe").length,
        guests: event.rsvps.reduce((acc, r) => acc + (r.guests || 0), 0),
      },
      myRsvp: myRsvp
        ? { id: myRsvp.id, response: myRsvp.response, guests: myRsvp.guests }
        : null,
      slots: event.slots.map((s) => ({
        id: s.id,
        // "station:<id>" or "role:<id>" for slots imported from a Waypoint
        // event file; null for slots made by hand in Compass.
        key: s.key,
        title: s.title,
        description: s.description,
        capacity: s.capacity,
        allowWaitlist: s.allowWaitlist,
        active: s.assignments.filter((a) => !a.waitlisted).length,
        waitlisted: s.assignments.filter((a) => a.waitlisted).length,
        // The caller's own seat, so the app can offer take or release.
        mine: seatOf(s.assignments, user.id),
      })),
    },
  });
});
