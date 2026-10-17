// GET /api/v1/orgs/[id-or-slug]/posts — recent published posts
// (public + members-only; the caller is a member).

import { prisma } from "@/lib/db";
import { json, requireOrgAccess, v1Route } from "@/lib/api/v1";
import { summariseReactions } from "@/lib/posts/reactions";

export const runtime = "nodejs";

export const GET = v1Route<{ slug: string }>(async (_req, { user, params }) => {
  const { org } = await requireOrgAccess(params.slug, user.id);

  const posts = await prisma.post.findMany({
    where: { orgId: org.id, publishedAt: { lte: new Date() } },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take: 50,
    include: {
      author: { select: { id: true, displayName: true } },
      photos: { orderBy: { sortOrder: "asc" }, select: { filename: true, caption: true } },
      _count: { select: { reactions: true, comments: true } },
    },
  });

  const rows = await prisma.postReaction.findMany({
    where: { postId: { in: posts.map((p) => p.id) } },
    select: { postId: true, userId: true, kind: true },
  });
  const summary = summariseReactions(rows, user.id);
  const none = { likes: 0, bookmarks: 0, youLiked: false, youBookmarked: false };

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
      photos: p.photos,
      reactions: summary.get(p.id) ?? none,
    })),
  });
});
