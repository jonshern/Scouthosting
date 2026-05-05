// Unsubscribe tokens — HMAC-signed, scoped to (memberId, orgId). Long
// TTL on purpose: an unsubscribe link sent in 2026 should still work
// in 2030. Privilege grant is narrow (one bit on one member).

import { makeSignedToken, verifySignedToken } from "./signed-token";

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

function secretFor(): string {
  return (
    process.env.UNSUB_SECRET ||
    process.env.RSVP_SECRET ||
    process.env.SESSION_SECRET ||
    "dev-secret-do-not-use-in-prod"
  );
}

export type UnsubClaims = {
  kind: "unsub";
  memberId: string;
  orgId: string;
  exp: number;
};

export function makeUnsubToken(args: { memberId: string; orgId: string }): string {
  return makeSignedToken(
    { kind: "unsub", memberId: args.memberId, orgId: args.orgId },
    { secret: secretFor(), ttlSeconds: TEN_YEARS },
  );
}

export function verifyUnsubToken(
  token: string,
  opts: { orgId?: string } = {},
): UnsubClaims | null {
  const claims = verifySignedToken<UnsubClaims>(token, { secret: secretFor() });
  if (!claims || claims.kind !== "unsub") return null;
  if (opts.orgId && claims.orgId !== opts.orgId) return null;
  return claims;
}
