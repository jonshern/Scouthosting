// GET /api/v1/channels?orgId= — channels the bearer-auth user is a
// member of. Mobile chat list view. Only orgs the user still belongs
// to are included, so a stale ChannelMember row left behind after
// someone leaves a unit can't keep its chat visible.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { IdSchema, json, readQuery, v1Route } from "@/lib/api/v1";

export const runtime = "nodejs";

const Query = z.object({ orgId: IdSchema.optional() });

export const GET = v1Route(async (req, { user }) => {
  const { orgId } = readQuery(req, Query);

  const memberships = await prisma.orgMembership.findMany({
    where: { userId: user.id, ...(orgId ? { orgId } : {}) },
    select: { orgId: true },
  });
  const orgIds = memberships.map((m) => m.orgId);
  if (!orgIds.length) return json({ channels: [] });

  const rows = await prisma.channel.findMany({
    where: {
      orgId: { in: orgIds },
      members: { some: { userId: user.id } },
      archivedAt: null,
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      messages: {
        where: { deletedAt: null },
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

  return json({
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
