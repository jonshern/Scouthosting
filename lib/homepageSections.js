// Homepage section ordering + visibility for the public unit site.
//
// A unit's Page row stores:
//   - sectionOrder: optional ordered array of section keys
//   - sectionVisibility: optional map of section key → boolean
//
// This module is the single source of truth for resolving those into
// a concrete render plan. Defaults apply when the org hasn't
// customised — no Page row, or the JSON columns are null.

export const SECTIONS = Object.freeze({
  hero: { label: "Hero", description: "Headline, lede, hero image, two CTAs." },
  about: { label: "About us", description: "About paragraph + meeting day/time." },
  whatWeDo: { label: "What we do", description: "Free-form Markdown block." },
  upcoming: { label: "Upcoming events", description: "Next 4 events from the calendar." },
  posts: { label: "Latest posts", description: "Activity feed (4 latest)." },
  albums: { label: "Photo albums", description: "Public-gallery preview." },
  testimonials: { label: "Testimonials", description: "Parent quotes." },
  join: { label: "How to join", description: "Join paragraph." },
  contact: { label: "Contact", description: "Contact note + Scoutmaster email." },
});

export const DEFAULT_ORDER = Object.freeze([
  "hero",
  "about",
  "whatWeDo",
  "upcoming",
  "posts",
  "albums",
  "testimonials",
  "join",
  "contact",
]);

/**
 * Resolve the ordered, visibility-filtered list of section keys for a
 * Page row. Unknown keys are dropped silently (so renaming a section
 * doesn't break existing customisation). Missing keys fall back to
 * the default order, so adding a new section auto-appears for orgs
 * that haven't customised.
 */
export function resolvePlan(page) {
  const order = Array.isArray(page?.sectionOrder) && page.sectionOrder.length
    ? page.sectionOrder.filter((k) => SECTIONS[k])
    : [...DEFAULT_ORDER];
  // Append any default-known sections that aren't already in the
  // user's custom order — keeps a customised org's page from missing
  // a newly-added section.
  for (const k of DEFAULT_ORDER) {
    if (!order.includes(k)) order.push(k);
  }
  const vis = page?.sectionVisibility || {};
  return order.filter((k) => vis[k] !== false);
}

/**
 * Validate + normalise an admin-form patch before persisting. Throws
 * on unknown keys (admin-form tampering). Accepts an arbitrary
 * subset; missing keys leave the existing value alone.
 */
export function normaliseSectionPatch({ order, visibility }) {
  const out = {};
  if (order !== undefined) {
    if (!Array.isArray(order)) throw new Error("order must be an array");
    for (const k of order) {
      if (!SECTIONS[k]) throw new Error(`Unknown section: ${k}`);
    }
    out.sectionOrder = [...order];
  }
  if (visibility !== undefined) {
    const v = {};
    for (const [k, value] of Object.entries(visibility || {})) {
      if (!SECTIONS[k]) throw new Error(`Unknown section: ${k}`);
      v[k] = Boolean(value);
    }
    out.sectionVisibility = v;
  }
  return out;
}

/**
 * Parse the testimonials JSON column into a typed array. Returns []
 * if missing or shape-mismatched. Each row: { quote, attribution }.
 */
export function readTestimonials(page) {
  const raw = page?.testimonialsJson;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t.quote === "string")
    .map((t) => ({ quote: t.quote, attribution: t.attribution || "" }));
}
