// GET /api/v1/orgs/[id-or-slug]/events?from=&to= — events for the
// mobile calendar (`since`/`until` are accepted as older aliases).
// With no range, returns upcoming events.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { IsoDate, badRequest, json, readQuery, requireOrgAccess, v1Route } from "@/lib/api/v1";
import { eventStyle, loadOrgCategories, rsvpCountsFor } from "@/lib/api/v1-event-view";

export const runtime = "nodejs";

const Query = z.object({
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  since: IsoDate.optional(),
  until: IsoDate.optional(),
});

export const GET = v1Route<{ slug: string }>(async (req, { user, params }) => {
  const { org } = await requireOrgAccess(params.slug, user.id);

  const q = readQuery(req, Query);
  const from = q.from ?? q.since ?? ((q.to ?? q.until) ? undefined : new Date());
  const to = q.to ?? q.until;
  if (from && to && from > to) throw badRequest("invalid_range");

  const events = await prisma.event.findMany({
    where: {
      orgId: org.id,
      startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
    },
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
      capacity: true,
      cost: true,
    },
  });
  const ids = events.map((e) => e.id);
  const [custom, counts, mine] = await Promise.all([
    loadOrgCategories({ orgId: org.id, prisma }),
    rsvpCountsFor(prisma, ids),
    prisma.rsvp.findMany({
      where: { eventId: { in: ids }, userId: user.id },
      select: { eventId: true, response: true },
    }),
  ]);
  const myRsvp = new Map(mine.map((r) => [r.eventId, r.response]));
  return json({
    events: events.map(({ cost, ...e }) => ({
      ...e,
      ...eventStyle(e.category, custom),
      costCents: cost == null ? null : cost * 100,
      rsvpYesCount: counts.get(e.id)?.yes ?? 0,
      rsvpTotalCount: counts.get(e.id)?.total ?? 0,
      myRsvp: myRsvp.get(e.id) ?? null,
    })),
  });
});
