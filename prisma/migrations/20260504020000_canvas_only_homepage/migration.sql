-- Canvas-only homepage. server/template/site.html no longer has
-- {{ABOUT_BODY}} / {{JOIN_BODY}} / {{CONTACT_NOTE}} placeholders —
-- everything between hero and footer comes from Page.customBlocks
-- (edited via the GrapesJS canvas at /admin/site). The form-style
-- About / Join / Contact text fields are gone from the right-rail
-- Settings panel. If a unit wants those sections back, they drop a
-- Text block onto the canvas.
--
-- All seeded demo orgs go through applyTemplate(classicTroop) which
-- already provides equivalent Text + CTA + Contact blocks, so the
-- column drops don't lose visible content. App is not in production
-- yet; no real-world data to migrate.

ALTER TABLE "Page"
  DROP COLUMN IF EXISTS "aboutBody",
  DROP COLUMN IF EXISTS "joinBody",
  DROP COLUMN IF EXISTS "contactNote";
