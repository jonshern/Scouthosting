"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { canPostToChannel } from "@/lib/chat/permissions";
import { assertChannelTwoDeep } from "@/lib/chat";
import { publishMessage } from "@/lib/realtime/bus";

export type ChatActionState = { error?: string; ok?: true; messageId?: string } | null;

const SendSchema = z.object({
  channelId: z.string().min(1),
  body: z.string().trim().min(1).max(8000),
});

export async function sendMessage(
  _prev: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) {
    return { error: "Bad CSRF token." };
  }
  const { user } = await getSession();
  if (!user) return { error: "Sign in to post." };

  const parsed = SendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const channel = await prisma.channel.findUnique({
    where: { id: parsed.data.channelId },
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
  if (!channel) return { error: "Channel not found." };

  // Resolve actor context for the post-policy check.
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

  // Outsiders (including people who left the unit but kept a stale
  // channel row) stop here, before the two-deep check below can suspend
  // a channel they don't belong to.
  if (!membership) return { error: "Channel not found." };

  // Two-deep gate (auto-suspends if it would be violated).
  try {
    await assertChannelTwoDeep(channel.id, { prismaClient: prisma });
  } catch (err) {
    const e = err as { code?: string; reason?: string };
    if (e.code === "CHANNEL_SUSPENDED") {
      return { error: `Channel paused: ${e.reason ?? "two-deep failed"}.` };
    }
    throw err;
  }

  const allow = canPostToChannel(channel, {
    role: membership?.role,
    channelMembership,
    member,
  });
  if (!allow.ok) return { error: `Can't post: ${allow.reason}.` };

  const message = await prisma.message.create({
    data: {
      channelId: channel.id,
      authorId: user.id,
      body: parsed.data.body,
    },
    include: { author: { select: { id: true, displayName: true } } },
  });

  // Best-effort realtime fan-out for SSE subscribers on this pod.
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

  revalidatePath(`/o/[slug]/chat`, "page");
  return { ok: true, messageId: message.id };
}

const MarkReadSchema = z.object({ channelId: z.string().min(1) });

export async function markRead(
  _prev: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) {
    return { error: "Bad CSRF token." };
  }
  const { user } = await getSession();
  if (!user) return { error: "Sign in." };
  const parsed = MarkReadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid." };
  await prisma.channelMember.updateMany({
    where: { channelId: parsed.data.channelId, userId: user.id },
    data: { lastReadAt: new Date() },
  });
  return { ok: true };
}
