// GET /api/v1/events/[id] — single event detail with RSVP summary.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";
import { requireOrgMember } from "@/lib/api/org-resolve";

export const runtime = "nodejs";

export const GET = withBearerAuth(async (req: NextRequest, { user }) => {
  const id = req.nextUrl.pathname.split("/").pop() ?? "";
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      rsvps: {
        select: { id: true, userId: true, name: true, response: true, guests: true },
      },
      slots: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { assignments: { select: { id: true, name: true, waitlisted: true } } },
      },
    },
  });
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const member = await requireOrgMember(event.orgId, user.id);
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const myRsvp = event.rsvps.find((r) => r.userId === user.id);
  return NextResponse.json({
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
        title: s.title,
        description: s.description,
        capacity: s.capacity,
        allowWaitlist: s.allowWaitlist,
        active: s.assignments.filter((a) => !a.waitlisted).length,
        waitlisted: s.assignments.filter((a) => a.waitlisted).length,
      })),
    },
  });
});
