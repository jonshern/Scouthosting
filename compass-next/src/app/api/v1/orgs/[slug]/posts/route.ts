// GET /api/v1/orgs/[id-or-slug]/posts — recent posts (public + members).

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";
import { findOrgByIdOrSlug, requireOrgMember } from "@/lib/api/org-resolve";

export const runtime = "nodejs";

export const GET = withBearerAuth(async (req: NextRequest, { user }) => {
  const segments = req.nextUrl.pathname.split("/");
  const idOrSlug = segments[segments.length - 2];
  const org = await findOrgByIdOrSlug(idOrSlug);
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const member = await requireOrgMember(org.id, user.id);
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const posts = await prisma.post.findMany({
    where: { orgId: org.id, publishedAt: { lte: new Date() } },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take: 50,
    include: {
      author: { select: { id: true, displayName: true } },
      _count: { select: { reactions: true, comments: true } },
    },
  });

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      pinned: p.pinned,
      visibility: p.visibility,
      publishedAt: p.publishedAt,
      author: p.author,
      reactionCount: p._count.reactions,
      commentCount: p._count.comments,
    })),
  });
});
