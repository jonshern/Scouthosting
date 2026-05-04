-- Draft / publish / version-history support for the canvas editor.
--
-- Page.draftBlocks + CustomPage.draftBlocks: unpublished work-in-
-- progress. Editor reads draft over live; Save writes draft; Publish
-- copies draft → live (and snapshots into PageVersion); Revert clears
-- draft.
--
-- PageVersion: append-only history. One row per Publish, polymorphic
-- via (pageId, customPageId) — exactly one is set per row.
-- publishedById nullable so deleting a User doesn't cascade away the
-- audit trail.

ALTER TABLE "Page"
  ADD COLUMN "draftBlocks" JSONB;

ALTER TABLE "CustomPage"
  ADD COLUMN "draftBlocks" JSONB;

CREATE TABLE "PageVersion" (
  "id"            TEXT       NOT NULL PRIMARY KEY,
  "orgId"         TEXT       NOT NULL,
  "pageId"        TEXT,
  "customPageId"  TEXT,
  "blocks"        JSONB      NOT NULL,
  "publishedAt"   TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedById" TEXT,
  "label"         TEXT
);

ALTER TABLE "PageVersion"
  ADD CONSTRAINT "PageVersion_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PageVersion"
  ADD CONSTRAINT "PageVersion_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PageVersion"
  ADD CONSTRAINT "PageVersion_customPageId_fkey"
  FOREIGN KEY ("customPageId") REFERENCES "CustomPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PageVersion"
  ADD CONSTRAINT "PageVersion_publishedById_fkey"
  FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PageVersion_orgId_publishedAt_idx"
  ON "PageVersion"("orgId", "publishedAt");

CREATE INDEX "PageVersion_pageId_publishedAt_idx"
  ON "PageVersion"("pageId", "publishedAt");

CREATE INDEX "PageVersion_customPageId_publishedAt_idx"
  ON "PageVersion"("customPageId", "publishedAt");
