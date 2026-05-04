-- Super-admin templates can now seed default event categories per
-- new org. Empty = fall back to ensureDefaultEventCategories' lib
-- defaults (the 12 hardcoded slugs in lib/eventCategories.js).

ALTER TABLE "OrgTemplate"
  ADD COLUMN "eventCategoriesSeed" JSONB;
