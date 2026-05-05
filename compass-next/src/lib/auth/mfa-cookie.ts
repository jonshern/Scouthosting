// Constants extracted from server-actions/auth.ts because "use server"
// files can only export async functions. Imported by both the action
// module and the MFA login page so they agree on the cookie name.

export const MFA_PENDING_COOKIE = "compass_mfa_pending";
export const MFA_PENDING_TTL_SECONDS = 600; // 10 minutes
