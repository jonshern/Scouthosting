-- Weekly DM digest cadence state on User. The dmDigestCron sweep sets
-- this whenever it sends a digest, and uses the timestamp to gate the
-- 7-day cadence (only re-eligible after 7+ days). NULL = never
-- digested → eligible on first qualifying tick.

ALTER TABLE "User"
  ADD COLUMN "lastDmDigestSentAt" TIMESTAMP(3);
