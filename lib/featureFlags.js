// Per-org feature flags.
//
// Org.features is a nullable JSON map: { [key: string]: boolean | any }.
// Read via this module so unknown keys get a sensible default and we
// have one place to grep for "what flags exist."
//
// Toggled from /__super (super-admin console) — leaders never edit
// this directly, so we don't need a UI inside the regular admin app.

/**
 * Whitelist of known flags. Adding a new flag is intentional: every
 * flag is a real feature gate, not a "we'll figure out what to call it
 * later" wishlist. Default values apply when the flag isn't set on
 * the org.
 *
 * Flag conventions:
 *   - "<area>.<feature>" — namespaced so we can grep
 *   - default chooses the safe direction: false for risky / paid /
 *     beta features, true for established ones we might disable for
 *     a specific org
 */
export const FEATURE_FLAGS = Object.freeze({
  "chat.enabled":              { default: true,  description: "Group chat surface (enabled by default; toggle off for a unit that prefers email)." },
  "chat.youthMessaging":       { default: true,  description: "Youth members can post in chat. Off = adult-only chat (parents + leaders), still YPT-enforced." },
  "newsletter.enabled":        { default: true,  description: "Sunday newsletter composer + scheduler." },
  "treasurer.enabled":         { default: true,  description: "Treasurer report + reimbursement queue." },
  "photos.publicGallery":      { default: true,  description: "Public photo gallery on the unit's homepage." },
  "support.inAppForm":         { default: true,  description: "In-app 'Contact support' button that files a SupportTicket." },
  "analytics.enabled":         { default: true,  description: "Internal analytics rollup at /admin/analytics." },
  "mobile.pushNotifications":  { default: false, description: "Push notifications via the mobile app. Requires APNs + FCM credentials at the org level." },
});

const DEFAULTS = Object.fromEntries(
  Object.entries(FEATURE_FLAGS).map(([k, v]) => [k, v.default]),
);

/**
 * Resolve the value of `key` on this org, falling back to the
 * registered default.
 */
export function isEnabled(org, key) {
  if (!FEATURE_FLAGS[key]) {
    throw new Error(`Unknown feature flag: ${key}. Add it to FEATURE_FLAGS first.`);
  }
  const orgValue = org?.features && org.features[key];
  if (orgValue === undefined || orgValue === null) {
    return DEFAULTS[key];
  }
  return Boolean(orgValue);
}

/**
 * Return the full resolved flag map for an org (used by the
 * super-admin console to render the toggle UI).
 */
export function resolveAll(org) {
  return Object.fromEntries(
    Object.keys(FEATURE_FLAGS).map((k) => [k, isEnabled(org, k)]),
  );
}

/**
 * Validate + merge a partial update before persisting. Throws on
 * unknown keys (the super-admin form should never produce those —
 * loud failure is right). Returns the merged JSON object ready for
 * `Org.features = …`.
 */
export function mergeUpdate(currentFeatures, patch) {
  const next = { ...(currentFeatures || {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (!FEATURE_FLAGS[k]) {
      throw new Error(`Unknown feature flag: ${k}`);
    }
    next[k] = Boolean(v);
  }
  return next;
}
