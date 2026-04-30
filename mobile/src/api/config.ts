// API config. EXPO_PUBLIC_COMPASS_BASE_URL is read at build time; default
// matches the unit subdomain pattern parents will most commonly use. The
// org slug is stored alongside the token after sign-in so the mobile app
// can hit `https://<slug>.<apex>` directly.
//
// In dev: set EXPO_PUBLIC_COMPASS_BASE_URL=http://localhost:3000 in .env.
// In TestFlight / prod: leave unset and the app uses the per-org host
// captured at sign-in.

export type ApiConfig = {
  // Optional override (dev). When set, every request goes to this host
  // regardless of the user's org subdomain.
  baseUrl?: string;
};

export const DEFAULT_API_CONFIG: ApiConfig = {
  baseUrl: process.env.EXPO_PUBLIC_COMPASS_BASE_URL,
};

export const APEX_DOMAIN = process.env.EXPO_PUBLIC_COMPASS_APEX || "compass.app";

/** Resolve the host for a given org slug. */
export function hostForOrg(orgSlug: string, config: ApiConfig = DEFAULT_API_CONFIG): string {
  if (config.baseUrl) return config.baseUrl.replace(/\/$/, "");
  return `https://${orgSlug}.${APEX_DOMAIN}`;
}
