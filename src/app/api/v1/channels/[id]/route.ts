// GET /api/v1/channels/[id] — channel detail + first page of messages.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";

export const runtime = "nodejs";

const PAGE = 50;

export const GET = withBearerAuth(async (req: NextRequest, { user }) => {
  const id = req.nextUrl.pathname.split("/").pop() ?? "";
  const channel = await prisma.channel.findUnique({
    where: { id },
    include: {
      members: {
        where: { userId: user.id },
        select: { lastReadAt: true, role: true },
      },
    },
  });
  if (!channel) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!channel.members.length) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const messages = await prisma.message.findMany({
    where: { channelId: channel.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: PAGE + 1,
    include: { author: { select: { id: true, displayName: true } } },
  });
  const hasMore = messages.length > PAGE;
  const slice = messages.slice(0, PAGE).reverse();

  return NextResponse.json({
    channel: {
      id: channel.id,
      orgId: channel.orgId,
      kind: channel.kind,
      name: channel.name,
      patrolName: channel.patrolName,
      eventId: channel.eventId,
      isSuspended: channel.isSuspended,
      suspendedReason: channel.suspendedReason,
      archivedAt: channel.archivedAt,
      isLeaderOnly: channel.kind === "leaders",
      canPost: !channel.isSuspended && !channel.archivedAt,
      youAreChannelOwner: channel.members[0]?.role === "owner",
      updatedAt: channel.updatedAt,
    },
    messages: slice.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      body: m.body,
      deleted: !!m.deletedAt,
      pinned: m.pinned ?? false,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
      author: m.author
        ? { id: m.author.id, displayName: m.author.displayName }
        : null,
      attachment: null,
      reactions: [],
    })),
    hasMore,
  });
});
