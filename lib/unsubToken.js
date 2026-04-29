// Unsubscribe tokens — HMAC-signed, scoped to a (memberId, orgId) pair.
// The link in every broadcast carries one of these so a recipient can
// flip their `emailUnsubscribed` flag without logging in. Verifying
// re-checks the org binding to defeat cross-org token reuse.
//
// Long TTL on purpose: an unsubscribe link sent in 2026 should still
// work in 2030. We don't expire them aggressively; the privilege grant
// is narrow (one bit on one member's row).

import { makeSignedToken, verifySignedToken } from "./signedToken.js";

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

function secretFor() {
  return (
    process.env.UNSUB_SECRET ||
    process.env.RSVP_SECRET ||
    "dev-secret-do-not-use-in-prod"
  );
}

export function makeUnsubToken({ memberId, orgId }) {
  return makeSignedToken(
    { kind: "unsub", memberId, orgId },
    { secret: secretFor(), ttlSeconds: TEN_YEARS },
  );
}

export function verifyUnsubToken(token, { orgId } = {}) {
  const claims = verifySignedToken(token, { secret: secretFor() });
  if (!claims || claims.kind !== "unsub") return null;
  if (orgId && claims.orgId !== orgId) return null;
  return claims;
}
