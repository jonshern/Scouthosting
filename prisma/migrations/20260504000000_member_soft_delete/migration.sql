-- Soft-delete on Member. /admin/members "Remove" now sets deletedAt;
-- /admin/members/trash lists removed rows with restore + permanent-
-- delete actions. A cron sweep hard-deletes rows whose deletedAt is
-- older than 30 days, keeping the audit window short enough that
-- "remove and re-add" mid-flight doesn't bloat the table.
--
-- Existing rows have deletedAt = NULL (= active), matching the new
-- "active members" filter the audienceFor / directory pages apply.

ALTER TABLE "Member"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Member_orgId_deletedAt_idx" ON "Member"("orgId", "deletedAt");
