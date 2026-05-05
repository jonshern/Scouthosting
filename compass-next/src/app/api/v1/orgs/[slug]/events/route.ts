// GET /api/v1/orgs/[slug]/events — upcoming events for the mobile
// calendar tab. Bearer-authenticated; only returns the org if the
// user has an OrgMembership.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";

export const runtime = "nodejs";

export const GET = withBearerAuth(async (req: NextRequest, { user }) => {
  const slug = req.nextUrl.pathname.split("/").at(-2) ?? "";
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const member = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const now = new Date();
  const events = await prisma.event.findMany({
    where: { orgId: org.id, startsAt: { gte: now } },
    orderBy: { startsAt: "asc" },
    take: 100,
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
    },
  });
  return NextResponse.json({ events });
});
