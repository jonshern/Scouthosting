// HMAC-signed RSVP tokens for one-click email links.
//
// Token format: base64url(payload).base64url(signature)
// payload = JSON of { eventId, name, email, exp }
// signature = HMAC-SHA256(payload, RSVP_SECRET)
//
// Stateless: the token IS the RSVP authorization.

import { makeSignedToken, verifySignedToken } from "./signed-token";
import { linkSecret } from "./link-secret";

const DEFAULT_TTL_DAYS = 60;

function secretFor(): string {
  return linkSecret(["RSVP_SECRET"], "dev-rsvp-secret-do-not-use-in-prod");
}

export type RsvpClaims = {
  eventId: string;
  name: string;
  email: string;
  exp: number;
};

export function makeRsvpToken(args: {
  eventId: string;
  name: string;
  email: string;
  ttlDays?: number;
}): string {
  const ttlDays = args.ttlDays ?? DEFAULT_TTL_DAYS;
  return makeSignedToken(
    {
      eventId: args.eventId,
      name: args.name,
      email: String(args.email).toLowerCase(),
    },
    { secret: secretFor(), ttlSeconds: ttlDays * 24 * 60 * 60 },
  );
}

export function verifyRsvpToken(token: string | null | undefined): RsvpClaims | null {
  const claims = verifySignedToken<RsvpClaims>(token, { secret: secretFor() });
  if (!claims) return null;
  if (!claims.eventId || !claims.email || !claims.name) return null;
  return claims;
}
