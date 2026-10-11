// GET /api/v1/channels/[id]/messages?before=<iso>
// POST /api/v1/channels/[id]/messages { body }

import { z } from "zod";
import { prisma } from "@/lib/db";
import { canPostToChannel } from "@/lib/chat/permissions";
import { assertChannelTwoDeep } from "@/lib/chat";
import { publishMessage } from "@/lib/realtime/bus";
import {
  ApiError,
  IsoDate,
  LIMITS,
  forbidden,
  json,
  notFound,
  parseId,
  readJson,
  readQuery,
  requireOrgAccessForResource,
  v1Route,
} from "@/lib/api/v1";
import { loadMessagePage, loadReadableChannel, messageDto } from "@/lib/api/v1-chat";

export const runtime = "nodejs";

const Query = z.object({ before: IsoDate.optional() });

export const GET = v1Route<{ id: string }>(async (req, { user, params }) => {
  const channel = await loadReadableChannel(params.id, user.id);
  const { before } = readQuery(req, Query);
  return json(await loadMessagePage(channel.id, before));
});

const Body = z.object({
  body: z.string({ required_error: "empty" }).trim().min(1, "empty").max(8000, "too_long"),
  // Attachments aren't accepted from mobile yet; tolerated and ignored.
  attachment: z.unknown().optional(),
});

export const POST = v1Route<{ id: string }>(
  async (req, { user, params }) => {
    const channelId = parseId(params.id);
    const input = await readJson(req, Body);

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: {
        id: true,
        orgId: true,
        kind: true,
        postPolicy: true,
        patrolName: true,
        isSuspended: true,
        archivedAt: true,
      },
    });
    if (!channel) throw notFound();

    // Org membership first, so non-members learn nothing about the
    // channel (not even whether it is suspended).
    const access = await requireOrgAccessForResource(channel.orgId, user.id, { write: true });

    const [channelMembership, member] = await Promise.all([
      prisma.channelMember.findFirst({
        where: { channelId: channel.id, userId: user.id },
        select: { role: true },
      }),
      prisma.member.findFirst({
        where: { orgId: channel.orgId, email: user.email.toLowerCase() },
        select: { patrol: true },
      }),
    ]);
    // Mobile only posts into channels the user can read. canPostToChannel
    // lets leaders past every policy, which on its own would let them
    // write into conversations (DMs included) they can't see.
    if (!channelMembership) throw notFound();

    try {
      await assertChannelTwoDeep(channel.id, { prismaClient: prisma });
    } catch (err) {
      const e = err as { code?: string; reason?: string };
      if (e.code === "CHANNEL_SUSPENDED") {
        throw new ApiError(423, "channel_suspended", { reason: e.reason });
      }
      throw err;
    }

    const allow = canPostToChannel(channel, {
      role: access.role,
      channelMembership,
      member,
    });
    if (!allow.ok) throw forbidden(allow.reason);

    const message = await prisma.message.create({
      data: { channelId: channel.id, authorId: user.id, body: input.body },
      include: { author: { select: { id: true, displayName: true } } },
    });

    try {
      publishMessage(channel.id, {
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        author: message.author,
      });
    } catch {
      // Realtime fan-out is best-effort; the message is saved.
    }

    return json({ message: messageDto(message) });
  },
  { limits: [LIMITS.chatPost] },
);
