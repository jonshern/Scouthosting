// Mobile-side auth helpers. The flow:
//
//   1. signIn() opens the org's /auth/mobile/begin URL in an in-app
//      browser via expo-web-browser. The web flow signs the user in via
//      Lucia (web cookie) then redirects to compass://auth/callback?token=...
//   2. The browser session resolves with the deep-link URL; we parse the
//      token / userId / displayName and persist them in SecureStorage.
//   3. fetchMe() hits /api/v1/auth/me to get the membership list, which
//      we cache so the rest of the app knows which orgs the user is in
//      and which slug to talk to.
//
// signOut() revokes the bearer token server-side (best-effort) and then
// drops all locally-stored creds.

import { apiRequest, type ClientOptions } from "./client";
import { hostForOrg, type ApiConfig } from "./config";
import type { MeDto } from "./types";
import type { SecureStorage, StoredProfile } from "./storage";

export type SignInResult =
  | { ok: true; token: string; userId: string; displayName: string }
  | { ok: false; reason: "cancelled" | "missing_token" | "browser_unavailable" };

export type SignInOptions = {
  /** The org slug to begin sign-in against (e.g. the unit subdomain). */
  orgSlug: string;
  /** Deep-link scheme registered by the app — defaults to compass://auth/callback. */
  redirectUrl?: string;
  config?: ApiConfig;
  /** Test override: a function that opens a URL and returns the redirect. */
  openAuthSession?: (url: string, redirect: string) => Promise<{ url?: string; type: string }>;
};

const DEFAULT_REDIRECT = "compass://auth/callback";

/** Run the sign-in flow. Returns the bearer token + identity bits. */
export async function signIn(opts: SignInOptions): Promise<SignInResult> {
  const redirect = opts.redirectUrl || DEFAULT_REDIRECT;
  const startUrl = `${hostForOrg(opts.orgSlug, opts.config)}/auth/mobile/begin?redirect=${encodeURIComponent(redirect)}`;

  // We default to expo-web-browser at runtime; tests inject openAuthSession.
  let openAuthSession = opts.openAuthSession;
  if (!openAuthSession) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const wb = require("expo-web-browser");
      openAuthSession = (url: string, r: string) => wb.openAuthSessionAsync(url, r);
    } catch {
      return { ok: false, reason: "browser_unavailable" };
    }
  }

  const result = await openAuthSession(startUrl, redirect);
  if (result.type !== "success" || !result.url) {
    return { ok: false, reason: "cancelled" };
  }
  return parseCallback(result.url);
}

/** Pull token/userId/displayName out of the deep-link callback URL. */
export function parseCallback(callbackUrl: string): SignInResult {
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    return { ok: false, reason: "missing_token" };
  }
  const token = parsed.searchParams.get("token");
  const userId = parsed.searchParams.get("userId") || "";
  const displayName = parsed.searchParams.get("displayName") || "";
  if (!token) return { ok: false, reason: "missing_token" };
  return { ok: true, token, userId, displayName };
}

/** Persist a successful sign-in to SecureStorage. */
export async function persistSignIn(
  storage: SecureStorage,
  result: Extract<SignInResult, { ok: true }>,
  me: MeDto,
): Promise<StoredProfile> {
  const profile: StoredProfile = {
    userId: result.userId || me.user.id,
    displayName: result.displayName || me.user.displayName,
    email: me.user.email || "",
    orgs: me.memberships,
    activeOrgId: me.memberships[0]?.orgId,
  };
  await storage.setToken(result.token);
  await storage.setProfile(profile);
  return profile;
}

/** Fetch the /api/v1/auth/me payload using the active token. */
export function fetchMe(opts: ClientOptions): Promise<MeDto> {
  return apiRequest<MeDto>(opts, "/auth/me");
}

/** Revoke the bearer + clear local storage. */
export async function signOut(
  opts: ClientOptions & { tokenId?: string },
  storage: SecureStorage,
): Promise<void> {
  if (opts.tokenId) {
    try {
      await apiRequest(opts, `/auth/token/${opts.tokenId}`, { method: "DELETE" });
    } catch {
      // Best-effort — even if the server is unreachable we want the
      // local creds cleared so the user can sign in fresh.
    }
  }
  await storage.clearToken();
  await storage.clearProfile();
}
