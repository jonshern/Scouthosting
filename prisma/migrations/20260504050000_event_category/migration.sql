-- Per-org event category vocabulary. Replaces the hardcoded list in
-- lib/eventCategories.js with admin-managed labels + colors at
-- /admin/categories. Event.category stays a free-form string (no FK)
-- so deleting a category doesn't orphan events.
--
-- Defaults are seeded lazily on first /admin/categories visit, so this
-- migration is schema-only — no data migration needed.

CREATE TABLE "EventCategory" (
  "id"        TEXT      NOT NULL PRIMARY KEY,
  "orgId"     TEXT      NOT NULL,
  "slug"      TEXT      NOT NULL,
  "label"     TEXT      NOT NULL,
  "color"     TEXT      NOT NULL,
  "sortOrder" INTEGER   NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL
);

ALTER TABLE "EventCategory"
  ADD CONSTRAINT "EventCategory_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "EventCategory_orgId_slug_key"
  ON "EventCategory"("orgId", "slug");

CREATE INDEX "EventCategory_orgId_sortOrder_idx"
  ON "EventCategory"("orgId", "sortOrder");
