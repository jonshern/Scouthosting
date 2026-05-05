// GET /api/v1/channels — channels the bearer-auth user is a member
// of. Mobile chat list view.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";

export const runtime = "nodejs";

export const GET = withBearerAuth(async (req: NextRequest, { user }) => {
  const orgId = req.nextUrl.searchParams.get("orgId");
  const where: Record<string, unknown> = {
    members: { some: { userId: user.id } },
    archivedAt: null,
  };
  if (orgId) where.orgId = orgId;

  const rows = await prisma.channel.findMany({
    where: where as never,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          body: true,
          createdAt: true,
          author: { select: { displayName: true } },
        },
      },
      members: {
        where: { userId: user.id },
        select: { lastReadAt: true, role: true },
      },
    },
  });

  return NextResponse.json({
    channels: rows.map((c) => {
      const lastMessage = c.messages[0];
      const myMembership = c.members[0];
      const unread =
        !!lastMessage &&
        (!myMembership?.lastReadAt ||
          myMembership.lastReadAt < lastMessage.createdAt);
      return {
        id: c.id,
        orgId: c.orgId,
        kind: c.kind,
        name: c.name,
        patrolName: c.patrolName,
        eventId: c.eventId,
        isSuspended: !!c.isSuspended,
        suspendedReason: c.suspendedReason,
        archivedAt: c.archivedAt,
        isLeaderOnly: c.kind === "leaders",
        canPost: !c.isSuspended && !c.archivedAt,
        youAreChannelOwner: myMembership?.role === "owner",
        lastMessage: lastMessage
          ? {
              body: lastMessage.body,
              createdAt: lastMessage.createdAt,
              authorDisplayName: lastMessage.author?.displayName ?? null,
            }
          : null,
        unread,
        updatedAt: c.updatedAt,
      };
    }),
  });
});
