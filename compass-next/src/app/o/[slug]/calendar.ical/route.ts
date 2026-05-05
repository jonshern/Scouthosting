import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildIcal } from "@/lib/calendar/ical";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) {
    return new NextResponse("Not found", { status: 404 });
  }
  const events = await prisma.event.findMany({
    where: { orgId: org.id },
    orderBy: { startsAt: "asc" },
  });

  const body = buildIcal({
    calName: org.displayName,
    uidHost: process.env.APEX_HOST ?? "compass.app",
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      allDay: e.allDay,
      location: e.location,
      rrule: e.rrule,
      recurrenceUntil: e.recurrenceUntil,
      updatedAt: e.updatedAt,
    })),
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename=\"${slug}.ics\"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
