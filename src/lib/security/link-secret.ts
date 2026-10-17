// The HMAC key for one kind of signed link or cookie (RSVP, permission
// slip, unsubscribe, invite, pre-launch invite cookie).
//
// Uses the first of `names` that is set, then SESSION_SECRET, then
// BETTER_AUTH_SECRET (SESSION_SECRET first so links already sent keep
// working). In production a missing or short (< 32 characters)
// secret throws, so nothing is ever signed or accepted with a key that
// is in the source code; outside production `devFallback` keeps local
// runs and tests working. env.ts already refuses to boot production
// without BETTER_AUTH_SECRET/SESSION_SECRET, so this only fires if that
// check is bypassed.
//
// No Node imports: the invite cookie is checked in middleware.

const MIN_LENGTH = 32;

export function linkSecret(names: readonly string[], devFallback: string): string {
  for (const name of [...names, "SESSION_SECRET", "BETTER_AUTH_SECRET"]) {
    const v = process.env[name];
    if (!v) continue;
    if (process.env.NODE_ENV === "production" && v.length < MIN_LENGTH) {
      throw new Error(`${name} must be at least ${MIN_LENGTH} characters.`);
    }
    return v;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `No secret for signed links: set ${names[0] ?? "SESSION_SECRET"} or SESSION_SECRET (openssl rand -hex 32).`,
    );
  }
  return devFallback;
}
