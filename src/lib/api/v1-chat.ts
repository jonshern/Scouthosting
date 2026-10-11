// Chat helpers shared by the /api/v1/channels routes.

import { prisma } from "@/lib/db";
import { notFound, parseId } from "@/lib/api/v1";

export const MESSAGE_PAGE = 50;

/**
 * Load a channel the user may read: they must be a channel member AND
 * still belong to the channel's org. Anything else is a 404 so channel
 * ids can't be probed.
 */
export async function loadReadableChannel(rawId: unknown, userId: string) {
  const id = parseId(rawId);
  const channel = await prisma.channel.findUnique({
    where: { id },
    include: {
      members: {
        where: { userId },
        select: { lastReadAt: true, role: true },
      },
    },
  });
  if (!channel || !channel.members.length) throw notFound();
  const orgMember = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId: channel.orgId } },
    select: { role: true },
  });
  if (!orgMember) throw notFound();
  return channel;
}

export async function loadMessagePage(channelId: string, before?: Date) {
  const rows = await prisma.message.findMany({
    where: {
      channelId,
      deletedAt: null,
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: MESSAGE_PAGE + 1,
    include: { author: { select: { id: true, displayName: true } } },
  });
  return {
    messages: rows.slice(0, MESSAGE_PAGE).reverse().map(messageDto),
    hasMore: rows.length > MESSAGE_PAGE,
  };
}

type MessageRow = {
  id: string;
  channelId: string;
  body: string;
  deletedAt: Date | null;
  pinned?: boolean | null;
  createdAt: Date;
  editedAt: Date | null;
  author: { id: string; displayName: string } | null;
};

export function messageDto(m: MessageRow) {
  return {
    id: m.id,
    channelId: m.channelId,
    body: m.body,
    deleted: !!m.deletedAt,
    pinned: m.pinned ?? false,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    author: m.author ? { id: m.author.id, displayName: m.author.displayName } : null,
    attachment: null,
    reactions: [],
  };
}
