// GET /api/v1/orgs/[id-or-slug]/posts — recent published posts
// (public + members-only; the caller is a member).

import { prisma } from "@/lib/db";
import { json, requireOrgAccess, v1Route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = v1Route<{ slug: string }>(async (_req, { user, params }) => {
  const { org } = await requireOrgAccess(params.slug, user.id);

  const posts = await prisma.post.findMany({
    where: { orgId: org.id, publishedAt: { lte: new Date() } },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take: 50,
    include: {
      author: { select: { id: true, displayName: true } },
      _count: { select: { reactions: true, comments: true } },
    },
  });

  return json({
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
