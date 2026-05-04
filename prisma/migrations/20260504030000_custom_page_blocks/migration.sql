-- Add canvas to custom pages. Same JSON shape as Page.customBlocks
-- — render dispatcher reuses lib/blocks/* and the static text/image/
-- cta types. `body` (Markdown) stays as a fallback for any pre-existing
-- page that hasn't been opened in the canvas editor yet.

ALTER TABLE "CustomPage"
  ADD COLUMN "blocks" JSONB;
