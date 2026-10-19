// Who pays for what. Units pay one price for Compass, Waypoint and
// Lantern together (pricing.ts, trial.ts). Waypoint's counselor tools
// are free for every adult account, with or without a unit (Jon,
// 2026-10-19): an independent merit badge counselor works with scouts
// from many troops and has no unit to pay for. So nothing a counselor
// does (badge list, meetings, assigned scouts, staffing badge days,
// sign-ups) may ever check a unit's billing state; only a unit's own
// admin pages lock (components/admin/BillingGate.tsx). Waypoint reads
// this from GET /api/v1/auth/me.

export type CounselorAccess = "free" | "none";

export type Entitlements = {
  waypoint: {
    /** "free" for adults; "none" for scouts, who can't counsel. */
    counselorTools: CounselorAccess;
  };
};

export function entitlementsFor({ isYouth }: { isYouth: boolean }): Entitlements {
  return { waypoint: { counselorTools: isYouth ? "none" : "free" } };
}
