function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

// Prefix for the sign-in cookies (session is "<prefix>_session"). The demo
// gets its own by default so a demo sign-in never touches a real one;
// COOKIE_PREFIX sets it for any other deployment sharing a host name.
function cookiePrefix(): string {
  const v = process.env.COOKIE_PREFIX || (process.env.DEMO_MODE === "1" ? "compass_demo" : "compass");
  if (!/^[a-z][a-z0-9_]*$/.test(v)) throw new Error("COOKIE_PREFIX must be lowercase letters, digits and _.");
  return v;
}

// APEX_HOST drives tenancy classification (apex / tenant / custom). If it
// silently falls back to "localhost" in production the apex domain gets
// misclassified as a custom domain and every request 404s. Fail fast in
// production so misconfigured deploys are loud, not silent.
//
// We skip the strict check during `next build` (NEXT_PHASE is set to
// "phase-production-build") so production *builds* don't require the
// runtime env. The check fires when the server actually boots.
function apexHost(): string {
  const v = process.env.APEX_HOST;
  if (v) return v;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error("Missing required env var: APEX_HOST");
  }
  return "localhost";
}

// SESSION_SECRET signs sessions (via Better Auth) and every one-shot link
// (RSVP, invite, unsubscribe, permission slip). Each of those modules has
// a hard-coded dev fallback, so a production server without the secret
// would accept links anyone can forge. Refuse to boot instead.
const DEV_SECRET = "dev-only-not-secret-replace-in-prod-0123456789abcdef";

function authSecret(): string {
  const v = process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    if (!v) throw new Error("Missing required env var: SESSION_SECRET (generate with: openssl rand -hex 32)");
    if (v.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
  }
  return v || DEV_SECRET;
}

export const env = {
  NODE_ENV: optional("NODE_ENV", "development"),
  DATABASE_URL: required("DATABASE_URL"),
  APEX_HOST: apexHost(),
  COOKIE_DOMAIN: optional("COOKIE_DOMAIN", ""),
  COOKIE_PREFIX: cookiePrefix(),
  SESSION_SECRET: optional("SESSION_SECRET", DEV_SECRET),
  AUTH_SECRET: authSecret(),
  ALLOW_ADMIN_PASSWORD_LOGIN: optional("ALLOW_ADMIN_PASSWORD_LOGIN", ""),
} as const;

export const isProd = () => env.NODE_ENV === "production";
export const isTest = () => env.NODE_ENV === "test";
