-- Per-channel post policy: who's allowed to post a message.
-- Adult leaders + admins always pass; this column scopes who *else* can post.
--   "everyone" — any org member can post (broadcast-style)
--   "members"  — only ChannelMember rows can post
--   "section"  — only members whose Member.patrol matches Channel.patrolName
--   "leaders"  — only adult leaders + admins can post (announcement-only)
ALTER TABLE "Channel" ADD COLUMN "postPolicy" TEXT NOT NULL DEFAULT 'members';

-- Pre-existing channels get sensible defaults that match how they
-- behaved before the gate existed:
--   troop-kind   → everyone (the all-hands channel; anyone could post)
--   parents-kind → leaders  (announcement-style: leaders broadcast,
--                            parents reply via existing pre-existing
--                            replies — converted to a leaders-only
--                            channel since "broadcast" was the de
--                            facto behaviour. Admins can change post-
--                            install if a unit prefers two-way.)
--   patrol-kind  → section  (only members of that patrol post)
--   leaders-kind → members  (already gated to leaders by membership)
--   event-kind   → members  (signed-up attendees)
--   custom-kind  → members  (whatever the leader configured)
UPDATE "Channel" SET "postPolicy" = 'everyone' WHERE "kind" = 'troop';
UPDATE "Channel" SET "postPolicy" = 'leaders'  WHERE "kind" = 'parents';
UPDATE "Channel" SET "postPolicy" = 'section'  WHERE "kind" = 'patrol';
