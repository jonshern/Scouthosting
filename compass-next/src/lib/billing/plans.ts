// Plan-gating + add-ons. Distinct from billing-state (lib/billing/state)
// which gates on payment status, and feature flags which are operator
// toggles per org.
//
// Demo orgs (Org.isDemo) bypass plan-gating entirely so the demo
// surface always shows the full feature set.

export const PLAN_PRICING = {
  patrol: { label: "Patrol", monthlyUsd: 12, blurb: "Small unit (≤25 members)" },
  troop: { label: "Troop", monthlyUsd: 20, blurb: "Standard unit + advanced features" },
  council: {
    label: "Council",
    monthlyUsd: null as number | null,
    blurb: "Custom — multi-org rollups, SSO, white-label",
  },
} as const;

export type PlanKey = keyof typeof PLAN_PRICING;

const TIER_RANK: Record<PlanKey, number> = { patrol: 0, troop: 1, council: 2 };

export const PLAN_FEATURES = {
  "newsletter.scheduler": { minTier: "troop" as PlanKey, label: "Newsletter scheduler" },
  "domain.custom": { minTier: "troop" as PlanKey, label: "Custom domain" },
  "council.rollup": { minTier: "council" as PlanKey, label: "Multi-org rollup" },
} as const;

export type PlanFeatureKey = keyof typeof PLAN_FEATURES;

export type OrgLikeForPlans = {
  plan?: PlanKey | string | null;
  isDemo?: boolean | null;
  displayName?: string | null;
  addOns?: string[] | null;
} | null | undefined;

export function planLabel(plan: string | null | undefined): string {
  return PLAN_PRICING[plan as PlanKey]?.label || String(plan ?? "");
}

export function planRank(plan: string | null | undefined): number {
  return TIER_RANK[plan as PlanKey] ?? -1;
}

export function planIncludes(org: OrgLikeForPlans, featureKey: PlanFeatureKey): boolean {
  if (!PLAN_FEATURES[featureKey]) {
    throw new Error(`Unknown plan feature: ${featureKey}. Add it to PLAN_FEATURES first.`);
  }
  if (!org) return false;
  if (org.isDemo) return true;
  return planRank(org.plan ?? null) >= planRank(PLAN_FEATURES[featureKey].minTier);
}

export const ADD_ONS = {
  messaging: {
    label: "Enhanced messaging",
    description:
      "Reach families instantly. Send broadcast email and SMS to any audience, run group chats, schedule recurring newsletters, and DM individual members — all from one place.",
    priceUsdPerYear: 19.99,
    bullets: [
      "Direct messages between leaders and members (with email backstop for unread)",
      "Broadcast email + SMS to your whole roster, a patrol, or a saved group",
      "Group chat channels (troop, parents, leaders, per-patrol) with iOS + Android push",
      "Scheduled newsletters with embedded posts and events",
      "Per-recipient delivery tracking + history",
    ],
    routes: [
      "/admin/email",
      "/admin/email/sent",
      "/admin/dm",
      "/admin/newsletters",
      "/admin/channels",
      "/admin/chat",
      "/admin/groups",
    ],
  },
} as const;

export type AddOnKey = keyof typeof ADD_ONS;

export function hasAddOn(org: OrgLikeForPlans, addOnKey: AddOnKey): boolean {
  if (!ADD_ONS[addOnKey]) {
    throw new Error(`Unknown add-on: ${addOnKey}. Add it to ADD_ONS first.`);
  }
  if (!org) return false;
  if (org.isDemo) return true;
  const enabled = Array.isArray(org.addOns) ? org.addOns : [];
  return enabled.includes(addOnKey);
}
