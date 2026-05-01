-- CMS extensions for unit homepages.
-- Hero image, CTA pair, drag-orderable section list, per-section
-- visibility map, "what we do" Markdown block, testimonials array.

ALTER TABLE "Page" ADD COLUMN "heroImage"          TEXT;
ALTER TABLE "Page" ADD COLUMN "ctaPrimaryLabel"    TEXT;
ALTER TABLE "Page" ADD COLUMN "ctaPrimaryLink"     TEXT;
ALTER TABLE "Page" ADD COLUMN "ctaSecondaryLabel"  TEXT;
ALTER TABLE "Page" ADD COLUMN "ctaSecondaryLink"   TEXT;
ALTER TABLE "Page" ADD COLUMN "sectionOrder"       JSONB;
ALTER TABLE "Page" ADD COLUMN "sectionVisibility"  JSONB;
ALTER TABLE "Page" ADD COLUMN "whatWeDoBody"       TEXT;
ALTER TABLE "Page" ADD COLUMN "testimonialsJson"   JSONB;
