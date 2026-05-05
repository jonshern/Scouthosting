// Per-org feature flags.
//
// Org.features is a nullable JSON map. Read via this module so unknown
// keys get a sensible default and we have one place to grep for "what
// flags exist."
//
// Toggled from /__super (super-admin console) — leaders never edit
// this directly.

export type FeatureFlagKey =
  | "chat.enabled"
  | "chat.youthMessaging"
  | "newsletter.enabled"
  | "treasurer.enabled"
  | "photos.publicGallery"
  | "support.inAppForm"
  | "analytics.enabled"
  | "mobile.pushNotifications";

export const FEATURE_FLAGS: Record<FeatureFlagKey, { default: boolean; description: string }> = {
  "chat.enabled": {
    default: true,
    description:
      "Group chat surface (enabled by default; toggle off for a unit that prefers email).",
  },
  "chat.youthMessaging": {
    default: true,
    description:
      "Youth members can post in chat. Off = adult-only chat (parents + leaders), still YPT-enforced.",
  },
  "newsletter.enabled": {
    default: true,
    description: "Sunday newsletter composer + scheduler.",
  },
  "treasurer.enabled": {
    default: true,
    description: "Treasurer report + reimbursement queue.",
  },
  "photos.publicGallery": {
    default: true,
    description: "Public photo gallery on the unit's homepage.",
  },
  "support.inAppForm": {
    default: true,
    description: "In-app 'Contact support' button that files a SupportTicket.",
  },
  "analytics.enabled": {
    default: true,
    description: "Internal analytics rollup at /admin/analytics.",
  },
  "mobile.pushNotifications": {
    default: false,
    description:
      "Push notifications via the mobile app. Requires APNs + FCM credentials at the org level.",
  },
};

const DEFAULTS: Record<FeatureFlagKey, boolean> = Object.fromEntries(
  (Object.entries(FEATURE_FLAGS) as Array<[FeatureFlagKey, { default: boolean }]>).map(
    ([k, v]) => [k, v.default],
  ),
) as Record<FeatureFlagKey, boolean>;

type OrgLike = { features?: Record<string, unknown> | null } | null | undefined;

export function isEnabled(org: OrgLike, key: FeatureFlagKey): boolean {
  if (!FEATURE_FLAGS[key]) {
    throw new Error(`Unknown feature flag: ${key}. Add it to FEATURE_FLAGS first.`);
  }
  const orgValue = org?.features ? org.features[key] : undefined;
  if (orgValue === undefined || orgValue === null) {
    return DEFAULTS[key];
  }
  return Boolean(orgValue);
}

export function resolveAll(org: OrgLike): Record<FeatureFlagKey, boolean> {
  const out: Partial<Record<FeatureFlagKey, boolean>> = {};
  for (const k of Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]) {
    out[k] = isEnabled(org, k);
  }
  return out as Record<FeatureFlagKey, boolean>;
}

export function mergeUpdate(
  currentFeatures: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...(currentFeatures as Record<string, boolean> | null ?? {}) };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (!(k in FEATURE_FLAGS)) {
      throw new Error(`Unknown feature flag: ${k}`);
    }
    next[k] = Boolean(v);
  }
  return next;
}
