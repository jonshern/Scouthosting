// POST /api/v1/posts/[id]/reactions { kind } — toggle a like /
// bookmark on a published post. Mirrors the togglePostReaction server
// action.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { decideToggle, normaliseReactionKind } from "@/lib/posts/reactions";
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

export const runtime = "nodejs";

const Body = z.object({ kind: z.string().max(32) });

export const POST = v1Route<{ id: string }>(
  async (req, { user, params }) => {
    const postId = parseId(params.id);
    const input = await readJson(req, Body).catch((err) => {
      if (err instanceof z.ZodError) throw badRequest("bad_kind");
      throw err;
    });
    let kind: string;
    try {
      kind = normaliseReactionKind(input.kind);
    } catch {
      throw badRequest("bad_kind");
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, orgId: true, publishedAt: true },
    });
    if (!post || !post.publishedAt || post.publishedAt > new Date()) throw notFound();
    await requireOrgAccessForResource(post.orgId, user.id, { write: true });

    const where = { postId_userId_kind: { postId, userId: user.id, kind } };
    const existing = await prisma.postReaction.findUnique({ where });
    const op = decideToggle({ existing, kind });
    if (op === "insert") {
      await prisma.postReaction
        .create({ data: { postId, userId: user.id, kind } })
        .catch((err: { code?: string }) => {
          // A double-tap racing itself: the row is already there.
          if (err?.code !== "P2002") throw err;
        });
    } else {
      await prisma.postReaction.deleteMany({ where: { postId, userId: user.id, kind } });
    }
    return json({ ok: true, kind, action: op });
  },
  { limits: [LIMITS.reaction] },
);
