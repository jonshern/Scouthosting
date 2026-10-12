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

export async function loadMessagePage(channelId: string, before?: Date, viewerId?: string) {
  const rows = await prisma.message.findMany({
    where: {
      channelId,
      deletedAt: null,
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: MESSAGE_PAGE + 1,
    include: {
      author: { select: { id: true, displayName: true } },
      reactions: { select: { userId: true, emoji: true }, orderBy: { createdAt: "asc" } },
    },
  });
  return {
    messages: rows.slice(0, MESSAGE_PAGE).reverse().map((m) => messageDto(m, viewerId)),
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
  reactions?: { userId: string; emoji: string }[];
};

/** Emoji a chat reaction may be: one short emoji sequence, no text. */
export const REACTION_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\u200d|\ufe0f){1,8}$/u;

/** Reactions grouped by emoji, in the order each was first used. */
export function reactionBuckets(
  rows: { userId: string; emoji: string }[],
  viewerId?: string,
): { emoji: string; count: number; youReacted: boolean }[] {
  const byEmoji = new Map<string, { emoji: string; count: number; youReacted: boolean }>();
  for (const r of rows) {
    const b = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, youReacted: false };
    b.count += 1;
    if (viewerId && r.userId === viewerId) b.youReacted = true;
    byEmoji.set(r.emoji, b);
  }
  return [...byEmoji.values()];
}

export function messageDto(m: MessageRow, viewerId?: string) {
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
    reactions: m.deletedAt ? [] : reactionBuckets(m.reactions ?? [], viewerId),
  };
}
