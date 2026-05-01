-- Activity-feed reactions: like (public) + bookmark (personal).

CREATE TABLE "PostReaction" (
  "postId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostReaction_pkey" PRIMARY KEY ("postId", "userId", "kind"),
  CONSTRAINT "PostReaction_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE,
  CONSTRAINT "PostReaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "PostReaction_postId_kind_idx" ON "PostReaction"("postId", "kind");
CREATE INDEX "PostReaction_userId_kind_idx" ON "PostReaction"("userId", "kind");
