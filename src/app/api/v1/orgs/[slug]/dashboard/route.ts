// GET /api/v1/orgs/[id-or-slug]/dashboard — mobile home screen
// rollup. Upcoming events + recent posts + unread channels count.

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
      where: { orgId: org.id, publishedAt: { lte: new Date() } },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 5,
      select: {
        id: true,
        title: true,
        publishedAt: true,
        // Post.author isn't a relation in this schema — render the
        // post-photo preview client-side if needed.
      },
    }),
    prisma.channelMember.findMany({
      where: { userId: user.id, channel: { orgId: org.id, archivedAt: null } },
      include: {
        channel: {
          select: {
            id: true,
            name: true,
            kind: true,
            messages: {
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

  return NextResponse.json({
    org: { id: org.id, slug: org.slug, displayName: org.displayName },
    upcomingEvents,
    recentPosts,
    unreadChannels,
  });
});
