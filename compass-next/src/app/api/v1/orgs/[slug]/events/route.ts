// GET /api/v1/orgs/[id-or-slug]/events — upcoming events for the
// mobile calendar. Bearer-authenticated; only returns the org if the
// user has an OrgMembership.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";
import { findOrgByIdOrSlug, requireOrgMember } from "@/lib/api/org-resolve";

export const runtime = "nodejs";

export const GET = withBearerAuth(async (req: NextRequest, { user }) => {
  const segments = req.nextUrl.pathname.split("/");
  const idOrSlug = segments[segments.length - 2] ?? "";
  const org = await findOrgByIdOrSlug(idOrSlug);
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const member = await requireOrgMember(org.id, user.id);
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const since = req.nextUrl.searchParams.get("since");
  const until = req.nextUrl.searchParams.get("until");
  const where: Record<string, unknown> = { orgId: org.id };
  if (since || until) {
    where.startsAt = {
      ...(since ? { gte: new Date(since) } : {}),
      ...(until ? { lte: new Date(until) } : { gte: new Date() }),
    };
  } else {
    where.startsAt = { gte: new Date() };
  }

  const events = await prisma.event.findMany({
    where: where as never,
    orderBy: { startsAt: "asc" },
    take: 200,
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      allDay: true,
      location: true,
      locationAddress: true,
      category: true,
      signupRequired: true,
      rrule: true,
    },
  });
  return NextResponse.json({ events });
});
