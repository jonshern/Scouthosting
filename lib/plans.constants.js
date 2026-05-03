// Plan pricing + display copy. Split out from lib/plans.js so the
// marketing pages, the super-admin billing page, and the upgrade
// page all read from one source.

export const PLAN_PRICING = Object.freeze({
  patrol:  { label: "Patrol",  monthlyUsd: 12, blurb: "Small unit (≤25 members)" },
  troop:   { label: "Troop",   monthlyUsd: 20, blurb: "Standard unit + advanced features" },
  council: { label: "Council", monthlyUsd: null, blurb: "Custom — multi-org rollups, SSO, white-label" },
});
