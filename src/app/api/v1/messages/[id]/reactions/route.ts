// POST /api/v1/messages/[id]/reactions { emoji } — toggle the caller's
// emoji reaction on a chat message. Returns { message } with the
// updated reaction counts, the same shape posting a message returns.
// Only members of the message's channel can react; anything else is a
// 404 so message ids can't be probed.

import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  LIMITS,
  badRequest,
  json,
  notFound,
  parseId,
  readJson,
  requireOrgAccessForResource,
  v1Route,
} from "@/lib/api/v1";
import { REACTION_EMOJI, loadReadableChannel, messageDto } from "@/lib/api/v1-chat";

export const runtime = "nodejs";

const Body = z.object({ emoji: z.string().trim().min(1).max(32) });

const withReactions = {
  author: { select: { id: true, displayName: true } },
  reactions: { select: { userId: true, emoji: true }, orderBy: { createdAt: "asc" as const } },
};

export const POST = v1Route<{ id: string }>(
  async (req, { user, params }) => {
    const messageId = parseId(params.id);
    const input = await readJson(req, Body).catch((err) => {
      if (err instanceof z.ZodError) throw badRequest("bad_emoji");
      throw err;
    });
    if (!REACTION_EMOJI.test(input.emoji)) throw badRequest("bad_emoji");

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true, deletedAt: true },
    });
    if (!message || message.deletedAt) throw notFound();
    const channel = await loadReadableChannel(message.channelId, user.id);
    if (channel.archivedAt) throw notFound();
    await requireOrgAccessForResource(channel.orgId, user.id, { write: true });

    const key = { messageId, userId: user.id, emoji: input.emoji };
    const existing = await prisma.reaction.findUnique({ where: { messageId_userId_emoji: key } });
    if (existing) {
      await prisma.reaction.deleteMany({ where: key });
    } else {
      await prisma.reaction.create({ data: key }).catch((err: { code?: string }) => {
        // A double-tap racing itself: the row is already there.
        if (err?.code !== "P2002") throw err;
      });
    }

    const updated = await prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: withReactions,
    });
    return json({ message: messageDto(updated, user.id) });
  },
  { limits: [LIMITS.reaction] },
);
