// Which Compass server the app talks to.
//
// Every /api/v1 route is host-agnostic (bearer token, org from the path),
// so the app talks to one server for everything, like Waypoint and
// Lantern. The address is, in order:
//
//   1. one set on this phone (Profile > Server, the sign-in screen, or a
//      compass://connect?url=… link). AuthContext loads it at launch and
//      calls setServerAddress().
//   2. EXPO_PUBLIC_COMPASS_BASE_URL at build time (eas.json sets it per
//      build profile; scripts/phone.sh writes it to .env.local).
//   3. https://<EXPO_PUBLIC_COMPASS_APEX or compass.app>.
//
// See docs/phone.md.

import { normalizeServerUrl } from "./serverUrl";

export type ApiConfig = {
  // Optional override. When set, requests go to this host instead of the
  // current server address (tests use it).
  baseUrl?: string;
};

export const APEX_DOMAIN = process.env.EXPO_PUBLIC_COMPASS_APEX || "compass.app";

/** The address the build carries, before anything is set on the phone. */
export const BUILT_IN_SERVER =
  normalizeServerUrl(process.env.EXPO_PUBLIC_COMPASS_BASE_URL) || `https://${APEX_DOMAIN}`;

let current = BUILT_IN_SERVER;

/** The server every request goes to right now. */
export function serverAddress(): string {
  return current;
}

/** Point the app at another server; null goes back to the built-in one. */
export function setServerAddress(address: string | null): void {
  current = (address && normalizeServerUrl(address)) || BUILT_IN_SERVER;
}

export const DEFAULT_API_CONFIG: ApiConfig = {};

function base(config: ApiConfig): string {
  return (config.baseUrl || current).replace(/\/$/, "");
}

/**
 * Host for an org's API calls. The org is in the path, not the host, so
 * this is the current server whatever the org. Kept as a function so the
 * callers don't change if per-org hosts ever come back.
 */
export function hostForOrg(_orgSlug: string, config: ApiConfig = DEFAULT_API_CONFIG): string {
  return base(config);
}

/** Base URL for sign-in (/auth/mobile/begin works without an org). */
export function apexBaseUrl(config: ApiConfig = DEFAULT_API_CONFIG): string {
  return base(config);
}

/**
 * Image source for an uploaded photo. /uploads checks the bearer token
 * for members-only albums (the app can't share the browser's cookie).
 */
export function uploadSource(
  filename: string,
  token: string | null | undefined,
): { uri: string; headers?: Record<string, string> } {
  const path = filename.split("/").map(encodeURIComponent).join("/");
  return {
    uri: `${serverAddress()}/uploads/${path}`,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  };
}
