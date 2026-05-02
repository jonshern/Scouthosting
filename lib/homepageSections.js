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

// Custom-block section keys carry a "block:" prefix so they don't
// collide with the built-in section keys.
const BLOCK_PREFIX = "block:";
export const isCustomBlockKey = (k) => typeof k === "string" && k.startsWith(BLOCK_PREFIX);
export const customBlockId = (k) => (isCustomBlockKey(k) ? k.slice(BLOCK_PREFIX.length) : null);
export const customBlockKey = (id) => `${BLOCK_PREFIX}${id}`;

export const BLOCK_TYPES = Object.freeze({
  text:  { label: "Text",  description: "A heading and a paragraph (Markdown)." },
  image: { label: "Image", description: "A photo with optional caption." },
  cta:   { label: "Call to action", description: "Headline + body + button." },
});

/**
 * Resolve the ordered, visibility-filtered list of section keys for a
 * Page row. Unknown keys are dropped silently (so renaming a section
 * doesn't break existing customisation). Missing keys fall back to
 * the default order, so adding a new section auto-appears for orgs
 * that haven't customised.
 *
 * Custom-block keys ("block:<id>") are kept as-is when their backing
 * block still exists in `page.customBlocks`. New blocks not yet in
 * sectionOrder are appended at the end so they appear without
 * requiring the leader to manually re-order.
 */
export function resolvePlan(page) {
  const blocks = readCustomBlocks(page);
  const validBlockKeys = new Set(blocks.map((b) => customBlockKey(b.id)));
  const known = (k) => SECTIONS[k] || (isCustomBlockKey(k) && validBlockKeys.has(k));

  const order = Array.isArray(page?.sectionOrder) && page.sectionOrder.length
    ? page.sectionOrder.filter(known)
    : [...DEFAULT_ORDER];
  // Append any default-known sections that aren't already in the
  // user's custom order — keeps a customised org's page from missing
  // a newly-added section.
  for (const k of DEFAULT_ORDER) {
    if (!order.includes(k)) order.push(k);
  }
  // Append any custom blocks not yet in the order (newly-added blocks).
  for (const b of blocks) {
    const key = customBlockKey(b.id);
    if (!order.includes(key)) order.push(key);
  }
  const vis = page?.sectionVisibility || {};
  return order.filter((k) => vis[k] !== false);
}

/**
 * Validate + normalise an admin-form patch before persisting. Throws
 * on unknown keys (admin-form tampering). Accepts an arbitrary
 * subset; missing keys leave the existing value alone.
 */
export function normaliseSectionPatch({ order, visibility }, { knownBlockIds = [] } = {}) {
  const knownBlock = (k) => isCustomBlockKey(k) && knownBlockIds.includes(customBlockId(k));
  const out = {};
  if (order !== undefined) {
    if (!Array.isArray(order)) throw new Error("order must be an array");
    for (const k of order) {
      if (!SECTIONS[k] && !knownBlock(k)) throw new Error(`Unknown section: ${k}`);
    }
    out.sectionOrder = [...order];
  }
  if (visibility !== undefined) {
    const v = {};
    for (const [k, value] of Object.entries(visibility || {})) {
      if (!SECTIONS[k] && !knownBlock(k)) throw new Error(`Unknown section: ${k}`);
      v[k] = Boolean(value);
    }
    out.sectionVisibility = v;
  }
  return out;
}

/**
 * Read the customBlocks JSON column into a clean array. Drops any rows
 * that don't have a known block type, since the renderer would have to
 * skip them anyway.
 */
export function readCustomBlocks(page) {
  const raw = page?.customBlocks;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b) => b && typeof b.id === "string" && BLOCK_TYPES[b.type])
    .map((b) => ({ ...b }));
}

/**
 * Validate a single block patch coming from the admin form. Throws on
 * unknown type / missing id / wrong-shape config. Returns the cleaned
 * row ready to be persisted.
 */
export function normaliseCustomBlock(input) {
  if (!input || typeof input !== "object") throw new Error("block must be an object");
  const id = String(input.id || "").trim();
  if (!id) throw new Error("block id required");
  const type = String(input.type || "");
  if (!BLOCK_TYPES[type]) throw new Error(`Unknown block type: ${type}`);
  const out = { id, type };
  if (type === "text") {
    out.title = String(input.title || "").slice(0, 120);
    out.body = String(input.body || "").slice(0, 8000);
  } else if (type === "image") {
    out.filename = String(input.filename || "").slice(0, 200);
    out.caption = String(input.caption || "").slice(0, 200);
    out.alt = String(input.alt || "").slice(0, 200);
  } else if (type === "cta") {
    out.title = String(input.title || "").slice(0, 120);
    out.body = String(input.body || "").slice(0, 600);
    out.buttonLabel = String(input.buttonLabel || "").slice(0, 60);
    out.buttonLink = String(input.buttonLink || "").slice(0, 500);
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
