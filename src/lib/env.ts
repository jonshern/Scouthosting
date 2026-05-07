function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
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

export const env = {
  NODE_ENV: optional("NODE_ENV", "development"),
  DATABASE_URL: required("DATABASE_URL"),
  APEX_HOST: apexHost(),
  COOKIE_DOMAIN: optional("COOKIE_DOMAIN", ""),
  SESSION_SECRET: optional("SESSION_SECRET", "dev-only-not-secret"),
  ALLOW_ADMIN_PASSWORD_LOGIN: optional("ALLOW_ADMIN_PASSWORD_LOGIN", ""),
} as const;

export const isProd = () => env.NODE_ENV === "production";
export const isTest = () => env.NODE_ENV === "test";
