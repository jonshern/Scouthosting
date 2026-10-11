// GET /api/v1/orgs/[id-or-slug]/upcoming-events — narrow alias for
// the home screen widget. Same as /events but capped at 10.

import { prisma } from "@/lib/db";
import { json, requireOrgAccess, v1Route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = v1Route<{ slug: string }>(async (_req, { user, params }) => {
  const { org } = await requireOrgAccess(params.slug, user.id);

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
  return json({ events });
});
