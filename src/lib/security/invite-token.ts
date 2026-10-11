// Leader invitation tokens — admin enters email + role; we generate a
// signed token embedding orgId/email/role; invitee redeems via link.
//
// Stateless: replay-safe because the upsert preserves an existing
// OrgMembership rather than downgrading the role.

import { makeSignedToken, verifySignedToken } from "./signed-token";
import { linkSecret } from "./link-secret";

const TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

export type InviteRole = "leader" | "admin" | "parent" | "scout";

export const INVITABLE_ROLES = ["leader", "admin", "parent", "scout"] as const;

export const INVITE_ROLE_LABELS: Record<InviteRole, string> = {
  admin: "Admin (full org control)",
  leader: "Leader (Scoutmaster, ASM, Den Leader, etc.)",
  parent: "Parent / family",
  scout: "Scout (youth)",
};

export function inviteSecret(): string {
  return linkSecret(["INVITE_SECRET", "AUTH_TOKEN_SECRET", "RSVP_SECRET"], "dev-invite-secret-do-not-use-in-prod");
}

export type InviteClaims = {
  kind: "invite";
  orgId: string;
  email: string;
  role: InviteRole;
  invitedBy: string | null;
  exp: number;
};

export function makeInviteToken(
  args: { orgId: string; email: string; role: InviteRole; invitedBy?: string | null },
  opts: { secret: string },
): string {
  if (!args.orgId) throw new Error("orgId required");
  if (!args.email) throw new Error("email required");
  if (!args.role) throw new Error("role required");
  return makeSignedToken(
    {
      kind: "invite",
      orgId: args.orgId,
      email: String(args.email).trim().toLowerCase(),
      role: args.role,
      invitedBy: args.invitedBy ?? null,
    },
    { secret: opts.secret, ttlSeconds: TTL_SECONDS },
  );
}

export function verifyInviteToken(token: string, opts: { secret: string }): InviteClaims | null {
  const claims = verifySignedToken<InviteClaims>(token, { secret: opts.secret });
  if (!claims) return null;
  if (claims.kind !== "invite") return null;
  if (!claims.orgId || !claims.email || !claims.role) return null;
  return claims;
}
