// POST /api/v1/events/[id]/rsvp — submit an RSVP for the
// authenticated user. Body: { response, guests?, notes? }.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";
import { requireOrgMember } from "@/lib/api/org-resolve";

export const runtime = "nodejs";

export const POST = withBearerAuth(async (req: NextRequest, { user }) => {
  const segments = req.nextUrl.pathname.split("/");
  const id = segments[segments.length - 2] ?? "";
  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, orgId: true },
  });
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const member = await requireOrgMember(event.orgId, user.id);
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { response?: string; guests?: number; notes?: string };
  try {
    body = (await req.json()) as never;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const response = body.response ?? "yes";
  if (!["yes", "no", "maybe"].includes(response)) {
    return NextResponse.json({ error: "bad_response" }, { status: 400 });
  }
  const guests = Number.isFinite(body.guests) ? Math.max(0, Math.floor(body.guests!)) : 0;
  const notes = body.notes ? String(body.notes).slice(0, 1000) : null;

  const existing = await prisma.rsvp.findFirst({
    where: { eventId: event.id, userId: user.id },
    select: { id: true },
  });
  let rsvp;
  if (existing) {
    rsvp = await prisma.rsvp.update({
      where: { id: existing.id },
      data: { response, guests, notes },
    });
  } else {
    rsvp = await prisma.rsvp.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        userId: user.id,
        name: user.displayName,
        email: user.email,
        response,
        guests,
        notes,
      },
    });
  }
  return NextResponse.json({ rsvp: { id: rsvp.id, response: rsvp.response, guests: rsvp.guests } });
});
