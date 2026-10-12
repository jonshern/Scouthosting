// Production policy: anyone holding admin or super-admin must sign in
// with Google or Apple — passwords aren't accepted for admin accounts.
// In non-production we permit password login regardless so seeded demo
// admins keep working locally.
//
// Mirrors the Compass Express policy in `lib/auth.js#passwordLoginAllowedForRole`.
//
// Escape hatch: setting `ALLOW_ADMIN_PASSWORD_LOGIN=1` bypasses the
// SSO requirement. Used for staging / QA where standing up real Google
// or Apple OAuth isn't worth the effort. Never set in real production —
// it defeats the SSO requirement that's the whole point of the check.

import { isDemoMode } from "@/lib/demo/mode";

export function passwordLoginAllowedForRole({ privileged }: { privileged: boolean }): boolean {
  if (!privileged) return true;
  if (process.env.NODE_ENV !== "production") return true;
  // The demo's shared admin account signs in with its published password.
  if (isDemoMode()) return true;
  if (process.env.ALLOW_ADMIN_PASSWORD_LOGIN === "1") return true;
  return false;
}
