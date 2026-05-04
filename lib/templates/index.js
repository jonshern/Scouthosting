// Site templates — pre-designed homepage block trees that a unit can
// instantiate at signup (or via /admin/site/template) to land on a
// populated, properly-rendering site instead of a blank canvas.
//
// Each template exports:
//   {
//     key:           url-safe identifier
//     label:         short human name ("Classic Troop")
//     tagline:       one-line pitch shown in the picker
//     bestFor:       array of org-type hints (["troop", "crew", "ship"])
//     thumbnail:     /admin/-relative path to a preview image (optional)
//     describe(org): function that returns a paragraph to show under
//                    the thumbnail in the picker, customised per org
//                    (e.g. "Welcome to Sample Troop 100 — chartered by …")
//     build(org):    function that returns
//       {
//         page: { heroHeadline, heroLede, aboutBody, joinBody,
//                 contactNote, customBlocks } — fields to upsert
//                 onto the org's Page row
//         customPages: [ { title, slug, body, visibility, showInNav,
//                          sortOrder, ... } ] — starter pages to
//                 create (deduped by slug)
//         menu: optional array of nav entries (future use)
//       }
//
// The `build()` helper personalizes each template with the org's name,
// charter, council, etc. so a freshly-applied template feels written
// for that unit instead of generic "Welcome to YOUR_TROOP".

import { classicTroop } from "./classic-troop.js";

const TEMPLATES = [classicTroop];

export const TEMPLATE_LIST = Object.freeze(
  TEMPLATES.map((t) =>
    Object.freeze({
      key: t.key,
      label: t.label,
      tagline: t.tagline,
      bestFor: t.bestFor || [],
      thumbnail: t.thumbnail || null,
    }),
  ),
);

const TEMPLATES_BY_KEY = Object.fromEntries(TEMPLATES.map((t) => [t.key, t]));

export function getTemplate(key) {
  return TEMPLATES_BY_KEY[key] || null;
}

/**
 * Apply a template to an org. Idempotent in the sense that calling it
 * twice with the same template produces the same result; NOT idempotent
 * in the sense that it overwrites whatever the admin had in Page.
 *
 * Custom pages are created with `upsert` keyed on (orgId, slug) so
 * re-applying a template doesn't clone duplicates — it just rewrites
 * the body.
 *
 * Returns { page, customPages: [{ slug, action: "created"|"updated" }] }.
 */
export async function applyTemplate({ template, org, prisma }) {
  if (!template) throw new Error("template required");
  const built = template.build(org);

  // Upsert the homepage Page row.
  const pageData = {
    orgId: org.id,
    ...built.page,
  };
  const page = await prisma.page.upsert({
    where: { orgId: org.id },
    update: built.page,
    create: pageData,
  });

  // Create / update each starter custom page.
  const pageActions = [];
  for (const cp of built.customPages || []) {
    const existing = await prisma.customPage.findFirst({
      where: { orgId: org.id, slug: cp.slug },
      select: { id: true },
    });
    if (existing) {
      await prisma.customPage.update({
        where: { id: existing.id },
        data: { ...cp, orgId: org.id },
      });
      pageActions.push({ slug: cp.slug, action: "updated" });
    } else {
      await prisma.customPage.create({
        data: { ...cp, orgId: org.id },
      });
      pageActions.push({ slug: cp.slug, action: "created" });
    }
  }

  return { page, customPages: pageActions };
}
