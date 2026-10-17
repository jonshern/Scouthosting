// Production policy: anyone holding admin or super-admin signs in with
// Google or Apple, or with a password once two-step sign-in is set up
// (the password then only gets them to the code prompt). A unit made at
// /start has a password-only admin, and lib/auth/requirements.ts sends
// them to set up two-step before anything else, so without the second
// branch they'd be locked out at their next sign-in. A password alone is
// refused. In non-production we permit password login regardless so
// seeded demo admins keep working locally.
//
// Escape hatch: setting `ALLOW_ADMIN_PASSWORD_LOGIN=1` bypasses the
// SSO requirement. Used for staging / QA where standing up real Google
// or Apple OAuth isn't worth the effort. Never set in real production —
// it defeats the SSO requirement that's the whole point of the check.

import { isDemoMode } from "@/lib/demo/mode";

export function passwordLoginAllowedForRole({
  privileged,
  hasSecondStep = false,
}: {
  privileged: boolean;
  hasSecondStep?: boolean;
}): boolean {
  if (!privileged || hasSecondStep) return true;
  if (process.env.NODE_ENV !== "production") return true;
  // The demo's shared admin account signs in with its published password.
  if (isDemoMode()) return true;
  if (process.env.ALLOW_ADMIN_PASSWORD_LOGIN === "1") return true;
  return false;
}
