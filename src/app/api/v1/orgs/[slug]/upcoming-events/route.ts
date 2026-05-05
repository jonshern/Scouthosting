// GET /api/v1/orgs/[id-or-slug]/upcoming-events — narrow alias for
// the home screen widget. Same as /events but capped at 10.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";
import { findOrgByIdOrSlug, requireOrgMember } from "@/lib/api/org-resolve";

export const runtime = "nodejs";

export const GET = withBearerAuth(async (req: NextRequest, { user }) => {
  const segments = req.nextUrl.pathname.split("/");
  const idOrSlug = segments[segments.length - 2];
  const org = await findOrgByIdOrSlug(idOrSlug);
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const member = await requireOrgMember(org.id, user.id);
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const events = await prisma.event.findMany({
    where: { orgId: org.id, startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 10,
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      allDay: true,
      location: true,
      category: true,
      signupRequired: true,
    },
  });
  return NextResponse.json({ events });
});
