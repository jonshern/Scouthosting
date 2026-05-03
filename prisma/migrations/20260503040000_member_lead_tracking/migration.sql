-- Lead/CRM tracking on Member. Adds a lifecycle status discriminator
-- so /admin/leads can surface prospects (interested families that
-- haven't completed council registration) without polluting the
-- default member roster, plus a few fields to track contact-touch
-- timing and source attribution as a lead moves through the funnel.
--
-- Existing rows backfill to status="active" — a leader's directory
-- before this migration is by definition the active roster.

ALTER TABLE "Member"
  ADD COLUMN "status"           TEXT      NOT NULL DEFAULT 'active',
  ADD COLUMN "prospectSource"   TEXT,
  ADD COLUMN "prospectNote"     TEXT,
  ADD COLUMN "firstContactedAt" TIMESTAMP(3),
  ADD COLUMN "lastContactedAt"  TIMESTAMP(3);

CREATE INDEX "Member_orgId_status_idx" ON "Member"("orgId", "status");
