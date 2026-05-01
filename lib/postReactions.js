// Activity-feed reactions: like (public) + bookmark (personal).
//
// Two kinds, one toggle endpoint, one count helper. Pure functions
// (no Prisma dependency in this module) so the toggle policy + count
// shape are testable; persistence lives in server/api.

export const REACTION_KINDS = Object.freeze(["like", "bookmark"]);
const KIND_SET = new Set(REACTION_KINDS);

/**
 * Validate a kind string before persisting. Throws on tampered input
 * (admin-form / API consumers should never produce these).
 */
export function normaliseReactionKind(kind) {
  if (!KIND_SET.has(kind)) throw new Error(`Unknown reaction kind: ${kind}`);
  return kind;
}

/**
 * Decide whether to insert (toggle on) or delete (toggle off) a
 * reaction given the current state. Returns the operation a caller
 * should perform: "insert" | "delete". Pure — no DB access.
 *
 * Bookmarks are personal: only the user themselves sees the count.
 * Likes are public: count surfaces in the feed.
 */
export function decideToggle({ existing, kind }) {
  normaliseReactionKind(kind);
  return existing ? "delete" : "insert";
}

/**
 * Roll up reaction rows into a per-post summary the feed can render.
 * Input: array of { postId, userId, kind }. Output: Map<postId, {
 * likes, bookmarks, youLiked, youBookmarked }>.
 */
export function summariseReactions(rows, viewerUserId) {
  const summary = new Map();
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
