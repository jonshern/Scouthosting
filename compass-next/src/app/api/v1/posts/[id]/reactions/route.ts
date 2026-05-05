// POST /api/v1/posts/[id]/reactions { kind } — toggle a like /
// bookmark on a post. Mirrors the togglePostReaction server action.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";
import { decideToggle, normaliseReactionKind } from "@/lib/posts/reactions";

export const runtime = "nodejs";

export const POST = withBearerAuth(async (req: NextRequest, { user }) => {
  const segments = req.nextUrl.pathname.split("/");
  const postId = segments[segments.length - 2];
  let body: { kind?: string };
  try {
    body = (await req.json()) as never;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  let kind: string;
  try {
    kind = normaliseReactionKind(String(body.kind ?? ""));
  } catch {
    return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  }
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, orgId: true },
  });
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const member = await prisma.orgMembership.findFirst({
    where: { orgId: post.orgId, userId: user.id },
    select: { role: true },
  });
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existing = await prisma.postReaction.findUnique({
    where: { postId_userId_kind: { postId, userId: user.id, kind } },
  });
  const op = decideToggle({ existing, kind });
  if (op === "insert") {
    await prisma.postReaction.create({
      data: { postId, userId: user.id, kind },
    });
  } else if (existing) {
    await prisma.postReaction.delete({
      where: { postId_userId_kind: { postId, userId: user.id, kind } },
    });
  }
  return NextResponse.json({ ok: true, kind, action: op });
});
