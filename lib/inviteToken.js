// Leader invitation tokens.
//
// An admin enters an email + role; we generate a signed token that
// embeds the orgId, email, and intended role; the invitee clicks the
// link in the email and we create / attach a User and an OrgMembership
// at that role.
//
// Stateless — no DB invite row to manage. Replay-safe because once an
// OrgMembership exists for (userId, orgId) the upsert is a no-op (we
// preserve their existing role rather than downgrade them).

import { makeSignedToken, verifySignedToken } from "./signedToken.js";

const TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

/**
 * Resolve the secret used to sign invite tokens. Reuses the family of
 * env vars already in play for other signed tokens so a deploy doesn't
 * have to set yet another secret.
 */
export function inviteSecret() {
  return (
    process.env.INVITE_SECRET ||
    process.env.AUTH_TOKEN_SECRET ||
    process.env.RSVP_SECRET ||
    process.env.SESSION_SECRET ||
    "dev-invite-secret-do-not-use-in-prod"
  );
}

/**
 * Build an invitation token. The invitee can redeem it any time before
 * `ttlSeconds` elapses by clicking the link.
 */
export function makeInviteToken({ orgId, email, role, invitedBy }, { secret }) {
  if (!orgId) throw new Error("orgId required");
  if (!email) throw new Error("email required");
  if (!role) throw new Error("role required");
  return makeSignedToken(
    {
      kind: "invite",
      orgId,
      email: String(email).trim().toLowerCase(),
      role,
      invitedBy: invitedBy || null,
    },
    { secret, ttlSeconds: TTL_SECONDS },
  );
}

/**
 * Decode + verify an invitation token. Returns the claims or null on
 * tamper / expiry / wrong-shape.
 */
export function verifyInviteToken(token, { secret }) {
  const claims = verifySignedToken(token, { secret });
  if (!claims) return null;
  if (claims.kind !== "invite") return null;
  if (!claims.orgId || !claims.email || !claims.role) return null;
  return claims;
}

/** Roles an admin can invite to. Mirrors the Prisma Role enum. */
export const INVITABLE_ROLES = Object.freeze(["leader", "admin", "parent", "scout"]);
export const INVITE_ROLE_LABELS = Object.freeze({
  admin: "Admin (full org control)",
  leader: "Leader (Scoutmaster, ASM, Den Leader, etc.)",
  parent: "Parent / family",
  scout: "Scout (youth)",
});
