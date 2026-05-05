// GET /api/v1/channels/[id]/messages?before=<iso>
// POST /api/v1/channels/[id]/messages { body }

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";
import { canPostToChannel } from "@/lib/chat/permissions";
import { assertChannelTwoDeep } from "@/lib/chat";
import { publishMessage } from "@/lib/realtime/bus";

export const runtime = "nodejs";

const PAGE = 50;

export const GET = withBearerAuth(async (req: NextRequest, { user }) => {
  const segments = req.nextUrl.pathname.split("/");
  const channelId = segments[segments.length - 2];
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      members: { where: { userId: user.id }, select: { userId: true } },
    },
  });
  if (!channel) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!channel.members.length) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const before = req.nextUrl.searchParams.get("before");
  const where: Record<string, unknown> = { channelId, deletedAt: null };
  if (before) where.createdAt = { lt: new Date(before) };
  const rows = await prisma.message.findMany({
    where: where as never,
    orderBy: { createdAt: "desc" },
    take: PAGE + 1,
    include: { author: { select: { id: true, displayName: true } } },
  });
  const hasMore = rows.length > PAGE;
  const slice = rows.slice(0, PAGE).reverse();
  return NextResponse.json({
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

export const POST = withBearerAuth(async (req: NextRequest, { user }) => {
  const segments = req.nextUrl.pathname.split("/");
  const channelId = segments[segments.length - 2];
  let body: { body?: string };
  try {
    body = (await req.json()) as never;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const text = String(body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (text.length > 8000) return NextResponse.json({ error: "too_long" }, { status: 400 });

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
  if (!channel) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    await assertChannelTwoDeep(channel.id, { prismaClient: prisma });
  } catch (err) {
    const e = err as { code?: string; reason?: string };
    if (e.code === "CHANNEL_SUSPENDED") {
      return NextResponse.json(
        { error: "suspended", reason: e.reason },
        { status: 423 },
      );
    }
    throw err;
  }

  const [membership, channelMembership, member] = await Promise.all([
    prisma.orgMembership.findFirst({
      where: { orgId: channel.orgId, userId: user.id },
      select: { role: true },
    }),
    prisma.channelMember.findFirst({
      where: { channelId: channel.id, userId: user.id },
      select: { role: true },
    }),
    prisma.member.findFirst({
      where: { orgId: channel.orgId, email: user.email.toLowerCase() },
      select: { patrol: true },
    }),
  ]);

  const allow = canPostToChannel(channel, {
    role: membership?.role,
    channelMembership,
    member,
  });
  if (!allow.ok) {
    return NextResponse.json({ error: "forbidden", reason: allow.reason }, { status: 403 });
  }

  const message = await prisma.message.create({
    data: { channelId: channel.id, authorId: user.id, body: text },
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
    // ignore
  }

  return NextResponse.json({
    message: {
      id: message.id,
      channelId: message.channelId,
      body: message.body,
      deleted: false,
      pinned: false,
      createdAt: message.createdAt,
      editedAt: null,
      author: message.author
        ? { id: message.author.id, displayName: message.author.displayName }
        : null,
      attachment: null,
      reactions: [],
    },
  });
});
