-- Drop Page columns that the old /admin/content form wrote to but the
-- render path never read. With /admin/content gone and /admin/site
-- (GrapesJS) as the single editor, none of these have any effect:
--
--   * sectionOrder / sectionVisibility — never honored by the template
--     for built-in sections (only block-level visibility was checked)
--   * testimonialsJson — no {{TESTIMONIALS}} placeholder in site.html
--   * whatWeDoBody — no {{WHAT_WE_DO_BODY}} placeholder
--   * ctaPrimaryLabel/Link, ctaSecondaryLabel/Link — hero CTAs are
--     hardcoded in site.html
--   * heroImage — render path uses HERO_PHOTOS (Album-driven), not this
--
-- Surviving Page CMS columns: heroHeadline, heroLede, aboutBody,
-- joinBody, contactNote, customBlocks. All edited via /admin/site
-- (Site settings panel for text + theme; canvas for blocks).

ALTER TABLE "Page"
  DROP COLUMN IF EXISTS "sectionOrder",
  DROP COLUMN IF EXISTS "sectionVisibility",
  DROP COLUMN IF EXISTS "testimonialsJson",
  DROP COLUMN IF EXISTS "whatWeDoBody",
  DROP COLUMN IF EXISTS "ctaPrimaryLabel",
  DROP COLUMN IF EXISTS "ctaPrimaryLink",
  DROP COLUMN IF EXISTS "ctaSecondaryLabel",
  DROP COLUMN IF EXISTS "ctaSecondaryLink",
  DROP COLUMN IF EXISTS "heroImage";
