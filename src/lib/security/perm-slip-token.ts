// Permission slip tokens — HMAC-signed, scoped to (orgId, eventId,
// memberId). Carries the parent's email + display name so the public
// /permission-slip/[token] route can render the consent page without
// requiring a signed-in session. Modeled on rsvp-token.ts; both reuse
// the same generic signed-token primitive.

import { makeSignedToken, verifySignedToken } from "./signed-token";
import { linkSecret } from "./link-secret";

const DEFAULT_TTL_DAYS = 90;

function secretFor(): string {
  return linkSecret(["PERM_SLIP_SECRET", "RSVP_SECRET"], "dev-perm-slip-secret-do-not-use-in-prod");
}

export type PermSlipClaims = {
  kind: "perm-slip";
  orgId: string;
  eventId: string;
  memberId: string;
  parentEmail: string;
  parentName: string;
  exp: number;
};

export function makePermSlipToken(args: {
  orgId: string;
  eventId: string;
  memberId: string;
  parentEmail: string;
  parentName: string;
  ttlDays?: number;
}): string {
  const ttlDays = args.ttlDays ?? DEFAULT_TTL_DAYS;
  return makeSignedToken(
    {
      kind: "perm-slip",
      orgId: args.orgId,
      eventId: args.eventId,
      memberId: args.memberId,
      parentEmail: String(args.parentEmail).toLowerCase(),
      parentName: args.parentName,
    },
    { secret: secretFor(), ttlSeconds: ttlDays * 24 * 60 * 60 },
  );
}

export function verifyPermSlipToken(
  token: string | null | undefined,
): PermSlipClaims | null {
  const claims = verifySignedToken<PermSlipClaims>(token, { secret: secretFor() });
  if (!claims || claims.kind !== "perm-slip") return null;
  if (!claims.orgId || !claims.eventId || !claims.memberId) return null;
  return claims;
}
