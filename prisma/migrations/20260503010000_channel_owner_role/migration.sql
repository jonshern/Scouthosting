-- Channel-level owner role. Renames the existing "moderator" value on
-- ChannelMember.role to "owner" — the Slack-style language for "person
-- who manages this channel". Posting privilege still flows from
-- membership (any member posts in a regular channel); the "owner" role
-- only matters on announce-style "leaders" channels, where the owner
-- can post but other members are read-only.
--
-- Idempotent: re-running this is a no-op once all rows are 'owner'.

UPDATE "ChannelMember" SET "role" = 'owner' WHERE "role" = 'moderator';
