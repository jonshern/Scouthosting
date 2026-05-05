// Activity-feed reactions: like (public) + bookmark (personal).
//
// Two kinds, one toggle endpoint, one count helper. Pure — no Prisma
// dependency in this module so the toggle policy + count shape are
// testable. Persistence lives in a server action / route handler.

export const REACTION_KINDS = ["like", "bookmark"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

const KIND_SET = new Set<string>(REACTION_KINDS);

export function normaliseReactionKind(kind: string): ReactionKind {
  if (!KIND_SET.has(kind)) throw new Error(`Unknown reaction kind: ${kind}`);
  return kind as ReactionKind;
}

export function decideToggle({
  existing,
  kind,
}: {
  existing: unknown;
  kind: string;
}): "insert" | "delete" {
  normaliseReactionKind(kind);
  return existing ? "delete" : "insert";
}

export type ReactionRow = { postId: string; userId: string | null; kind: string };
export type ReactionSummary = {
  likes: number;
  bookmarks: number;
  youLiked: boolean;
  youBookmarked: boolean;
};

export function summariseReactions(
  rows: ReadonlyArray<ReactionRow>,
  viewerUserId: string | null,
): Map<string, ReactionSummary> {
  const summary = new Map<string, ReactionSummary>();
  for (const r of rows) {
    let s = summary.get(r.postId);
    if (!s) {
      s = { likes: 0, bookmarks: 0, youLiked: false, youBookmarked: false };
      summary.set(r.postId, s);
    }
    if (r.kind === "like") {
      s.likes++;
      if (r.userId === viewerUserId) s.youLiked = true;
    } else if (r.kind === "bookmark") {
      // Bookmarks are private — only count the viewer's own row.
      if (r.userId === viewerUserId) {
        s.bookmarks++;
        s.youBookmarked = true;
      }
    }
  }
  return summary;
}
