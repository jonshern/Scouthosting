// Event category vocabulary + colour mapping.
//
// Two-layer resolution: per-org admin-managed EventCategory rows
// (preferred when available) → hardcoded defaults below (fallback).
// `Event.category` is a free-form string in the schema; this module
// turns it into display metadata so callers don't have to know about
// the per-org table.
//
// Public/mobile callsites that don't have a customMap fall through
// to the defaults; admin surfaces that fetch the org's categories
// pass the customMap and get the leader's chosen colors.

export const CATEGORIES = Object.freeze({
  meeting: { label: "Meeting", color: "sky" },
  campout: { label: "Campout", color: "accent" },
  service: { label: "Service", color: "teal" },
  ceremony: { label: "Ceremony", color: "raspberry" },
  "court-of-honor": { label: "Court of Honor", color: "raspberry" },
  training: { label: "Training", color: "butter" },
  fundraiser: { label: "Fundraiser", color: "ember" },
  trip: { label: "Trip", color: "plum" },
  highadventure: { label: "High Adventure", color: "plum" },
  social: { label: "Social", color: "butter" },
  pinewood: { label: "Pinewood Derby", color: "raspberry" },
  blueandgold: { label: "Blue & Gold", color: "ember" },
});

export const CATEGORY_KEYS = Object.freeze(Object.keys(CATEGORIES));

// Hex equivalents of the semantic palette keys, for surfaces that
// need a real color value (e.g. the per-org seed). Mirrors tokens.css.
const SEMANTIC_HEX = Object.freeze({
  sky: "#bcd0f4",
  accent: "#caa54a",
  teal: "#5eead4",
  raspberry: "#fda4af",
  butter: "#fef3c7",
  ember: "#fed7aa",
  plum: "#ddd6fe",
  primary: "#1d6b39",
});

/**
 * Normalise a free-form category string into a stable key. Lowercases
 * + strips spaces/underscores so "Court of Honor" and "court_of_honor"
 * both map to "court-of-honor".
 */
export function normaliseCategory(raw) {
  if (!raw) return null;
  const key = String(raw).toLowerCase().trim().replace(/[\s_]+/g, "-");
  return CATEGORIES[key] ? key : null;
}

/** Slugify *any* free-form string into the same shape as our keys. */
export function slugifyCategory(raw) {
  if (!raw) return null;
  return String(raw).toLowerCase().trim().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/**
 * Resolve a free-form category string to its display metadata.
 * Returns { label, color } where color is a SEMANTIC palette key
 * (e.g. "sky"); callers wrap it with PALETTE_VAR / var(--key) to get
 * a CSS-ready value. Kept for backwards compat with non-admin
 * surfaces. Admin code should use resolveCategoryStyle instead.
 */
export function categoryMeta(raw) {
  const key = normaliseCategory(raw);
  if (key) return { ...CATEGORIES[key] };
  if (raw) return { label: String(raw), color: "primary" };
  return { label: "Event", color: "primary" };
}

/** The colour key only — convenience for templates that only need that. */
export function categoryColor(raw) {
  return categoryMeta(raw).color;
}

/**
 * CSS-ready style metadata. Returns { label, bg, fg } where both
 * colors are drop-in style="background:${bg};color:${fg}" values.
 * Per-org customMap (from loadOrgCategories) wins when present;
 * unmatched slugs fall through to the hardcoded defaults.
 */
export function resolveCategoryStyle(raw, customMap = null) {
  const slug = slugifyCategory(raw);
  if (customMap && slug && customMap[slug]) {
    const c = customMap[slug];
    return { label: c.label, bg: c.color, fg: pickContrast(c.color) };
  }
  // Default path: semantic key → CSS var with hardcoded ink-color rules
  const meta = categoryMeta(raw);
  const lightBg = meta.color === "accent" || meta.color === "butter";
  return {
    label: meta.label,
    bg: `var(--${meta.color})`,
    fg: lightBg ? "var(--ink)" : "#fff",
  };
}

function pickContrast(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#fff";
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 0xff, g = (v >> 8) & 0xff, b = v & 0xff;
  // Relative luminance approximation; works well enough for tag pills.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#0f172a" : "#fff";
}

/**
 * Load the per-org EventCategory rows as a slug → { label, color } map.
 * Returns {} if the org has none seeded yet (callers should call
 * ensureDefaultEventCategories first if they need defaults).
 */
export async function loadOrgCategories({ orgId, prisma }) {
  const rows = await prisma.eventCategory.findMany({
    where: { orgId },
    orderBy: { sortOrder: "asc" },
  });
  const map = {};
  for (const r of rows) map[r.slug] = { label: r.label, color: r.color };
  return map;
}

/**
 * Idempotent: seed the 12 hardcoded defaults for an org if the org
 * has zero EventCategory rows. Cheap to call (single COUNT).
 */
export async function ensureDefaultEventCategories({ orgId, prisma }) {
  const count = await prisma.eventCategory.count({ where: { orgId } });
  if (count > 0) return;
  const data = CATEGORY_KEYS.map((slug, idx) => ({
    orgId,
    slug,
    label: CATEGORIES[slug].label,
    color: SEMANTIC_HEX[CATEGORIES[slug].color] || SEMANTIC_HEX.primary,
    sortOrder: idx,
  }));
  await prisma.eventCategory.createMany({ data, skipDuplicates: true });
}
