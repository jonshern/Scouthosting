// GET /api/v1/orgs/[id-or-slug]/dashboard — mobile home screen
// rollup. Upcoming events + recent posts + unread channels count.

import { prisma } from "@/lib/db";
import { json, requireOrgAccess, v1Route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = v1Route<{ slug: string }>(async (_req, { user, params }) => {
  const { org } = await requireOrgAccess(params.slug, user.id);

  const now = new Date();
  const [upcomingEvents, recentPosts, channelMemberships] = await Promise.all([
    prisma.event.findMany({
      where: { orgId: org.id, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        location: true,
        signupRequired: true,
      },
    }),
    prisma.post.findMany({
      where: { orgId: org.id, publishedAt: { lte: now } },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 5,
      select: { id: true, title: true, publishedAt: true },
    }),
    prisma.channelMember.findMany({
      where: { userId: user.id, channel: { orgId: org.id, archivedAt: null } },
      select: {
        lastReadAt: true,
        channel: {
          select: {
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { createdAt: true },
            },
          },
        },
      },
    }),
  ]);

  const unreadChannels = channelMemberships.filter((cm) => {
    const last = cm.channel.messages[0]?.createdAt;
    return !!last && (!cm.lastReadAt || cm.lastReadAt < last);
  }).length;

  return json({
    org: { id: org.id, slug: org.slug, displayName: org.displayName },
    upcomingEvents,
    recentPosts,
    unreadChannels,
  });
});
