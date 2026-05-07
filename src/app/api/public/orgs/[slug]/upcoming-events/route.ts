// Public, read-only feed of upcoming events for the unit homepage.
// No auth — only fields safe for the public surface. Cached for 30s
// so a traffic spike or a slow DB doesn't blow up.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";

export const runtime = "nodejs";
// Cache the response for 60s at the route layer too (CDN-friendly).
export const revalidate = 60;

const fetchUpcomingEvents = unstable_cache(
  async (slug: string) => {
    const org = await prisma.org.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!org) return null;
    const events = await prisma.event.findMany({
      where: { orgId: org.id, startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 10,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        allDay: true,
        location: true,
        category: true,
      },
    });
    return events;
  },
  ["public", "org", "upcoming-events"],
  { revalidate: 30, tags: ["public-events"] },
);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  try {
    const events = await fetchUpcomingEvents(slug);
    if (!events) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(
      { events },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=300" } },
    );
  } catch (err) {
    // DB blip — return 503 with an empty list so the widget can show a
    // graceful "couldn't load" state without breaking the page.
    return NextResponse.json(
      { events: [], error: "db_unavailable" },
      { status: 503 },
    );
  }
}
