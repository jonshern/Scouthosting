// Event category vocabulary + colour mapping.
//
// Lives separately from lib/dashboard.js so the calendar list, public
// site, mobile app, and admin filter UI all share one source of truth.
// `Event.category` is a free-form string in the schema; this module
// resolves it to a label + semantic colour key.

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

/**
 * Resolve a free-form category string to its display metadata.
 * Returns { label, color } — falls back to { label: "Event", color:
 * "primary" } for unknown categories so the UI never blows up on a
 * leader's custom string.
 */
export function categoryMeta(raw) {
  const key = normaliseCategory(raw);
  if (key) return { ...CATEGORIES[key] };
  // Unknown but non-empty — let it through as a label so admin pages
  // can still show "Pancake Breakfast" or whatever the unit chose.
  if (raw) return { label: String(raw), color: "primary" };
  return { label: "Event", color: "primary" };
}

/** The colour key only — convenience for templates that only need that. */
export function categoryColor(raw) {
  return categoryMeta(raw).color;
}
