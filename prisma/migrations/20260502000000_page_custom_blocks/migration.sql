-- Custom homepage blocks. JSONB array of { id, type, ...config } objects.
-- Each block's id can appear in Page.sectionOrder (as "block:<id>") so
-- leaders can place them anywhere in the section flow.
ALTER TABLE "Page" ADD COLUMN "customBlocks" JSONB;
