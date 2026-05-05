function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const env = {
  NODE_ENV: optional("NODE_ENV", "development"),
  DATABASE_URL: required("DATABASE_URL"),
  APEX_HOST: optional("APEX_HOST", "localhost"),
  COOKIE_DOMAIN: optional("COOKIE_DOMAIN", ""),
  SESSION_SECRET: optional("SESSION_SECRET", "dev-only-not-secret"),
  ALLOW_ADMIN_PASSWORD_LOGIN: optional("ALLOW_ADMIN_PASSWORD_LOGIN", ""),
} as const;

export const isProd = () => env.NODE_ENV === "production";
export const isTest = () => env.NODE_ENV === "test";
