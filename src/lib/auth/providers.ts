// Google + Apple provider settings for Better Auth. A provider whose
// settings are missing is left out: its buttons aren't shown and its
// begin route sends people back to /login.
//
// Redirect URIs. With GOOGLE_REDIRECT_URI / APPLE_REDIRECT_URI unset,
// each sign-in host gets its own: <origin>/api/auth/callback/<provider>
// on the apex, on every PASSKEY_EXTRA_HOSTS host (the Mac's Tailscale
// name) and on the WEB_SIGNIN_ORIGINS sites, so a phone on the tailnet,
// a browser on localhost and Waypoint's website each finish where they
// started. Register one URI per host with the
// provider (docs/sign-in-providers.md). Setting the variable pins one
// URI for every host (the older setup, served by
// /api/auth/<provider>/callback). Tenant and custom-domain hosts always
// sign in on the apex (signInHref).

import crypto from "node:crypto";
import { TENANT_PASSTHROUGH_PREFIXES } from "@/lib/tenancy/host-header";
import { webSigninOrigins } from "./mobile-redirect";

function envOrNull(...names: string[]): string | null {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

export type GoogleConfig = { clientId: string; clientSecret: string; redirectURI?: string };

export function googleConfig(): GoogleConfig | null {
  const clientId = envOrNull("GOOGLE_CLIENT_ID");
  const clientSecret = envOrNull("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const redirectURI = envOrNull("GOOGLE_REDIRECT_URI");
  return { clientId, clientSecret, ...(redirectURI ? { redirectURI } : {}) };
}

export const googleConfigured = (): boolean => googleConfig() !== null;

export type AppleConfig = {
  clientId: string;
  clientSecret: string;
  redirectURI?: string;
  appBundleIdentifier?: string;
};

function applePrivateKeyPem(): string | null {
  const raw = envOrNull("APPLE_PRIVATE_KEY", "APPLE_PRIVATE_KEY_PEM");
  return raw ? raw.replace(/\\n/g, "\n") : null;
}

// Apple's client_secret is an ES256 JWT signed with the team's private
// key, valid for at most six months. It is minted when the server boots;
// every deploy or restart renews it, well inside the limit.
const APPLE_SECRET_TTL_SECONDS = 60 * 60 * 24 * 150;

export function appleClientSecret(
  opts: { teamId: string; keyId: string; clientId: string; privateKeyPem: string },
  now: Date = new Date(),
): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = { alg: "ES256", kid: opts.keyId, typ: "JWT" };
  const payload = {
    iss: opts.teamId,
    iat,
    exp: iat + APPLE_SECRET_TTL_SECONDS,
    aud: "https://appleid.apple.com",
    sub: opts.clientId,
  };
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const sig = crypto
    .sign("sha256", Buffer.from(signingInput), {
      key: opts.privateKeyPem,
      dsaEncoding: "ieee-p1363",
    })
    .toString("base64url");
  return `${signingInput}.${sig}`;
}

export function appleConfig(): AppleConfig | null {
  const clientId = envOrNull("APPLE_CLIENT_ID");
  const teamId = envOrNull("APPLE_TEAM_ID");
  const keyId = envOrNull("APPLE_KEY_ID");
  const privateKeyPem = applePrivateKeyPem();
  if (!clientId || !teamId || !keyId || !privateKeyPem) return null;
  const redirectURI = envOrNull("APPLE_REDIRECT_URI");
  const appBundleIdentifier = envOrNull("APPLE_APP_BUNDLE_ID") ?? undefined;
  return {
    clientId,
    clientSecret: appleClientSecret({ teamId, keyId, clientId, privateKeyPem }),
    ...(redirectURI ? { redirectURI } : {}),
    ...(appBundleIdentifier ? { appBundleIdentifier } : {}),
  };
}

export const appleConfigured = (): boolean =>
  !!(
    envOrNull("APPLE_CLIENT_ID") &&
    envOrNull("APPLE_TEAM_ID") &&
    envOrNull("APPLE_KEY_ID") &&
    applePrivateKeyPem()
  );

export type SocialProviderId = "google" | "apple";

// The providers to offer, in button order.
export function enabledSocialProviders(): SocialProviderId[] {
  const out: SocialProviderId[] = [];
  if (googleConfigured()) out.push("google");
  if (appleConfigured()) out.push("apple");
  return out;
}

// Hosts besides the apex that run their own sign-in, as Better Auth
// allowedHosts patterns: PASSKEY_EXTRA_HOSTS (the Mac's Tailscale name,
// with any port, which covers Waypoint's and Lantern's websites served
// on it) and the hosts of WEB_SIGNIN_ORIGINS, whose sign-in pages run
// on their own origin with Compass behind them.
export function extraSignInHostPatterns(): string[] {
  const extra = (process.env.PASSKEY_EXTRA_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, ""))
    .filter(Boolean)
    .flatMap((h) => [h, `${h}:*`]);
  const web = [...webSigninOrigins()].map((o) => new URL(o).host);
  return [...new Set([...extra, ...web])];
}

// Where a "Continue with Google/Apple" button starts. On the apex and on
// an extra sign-in host it's this host. On a unit's own host (subdomain
// or custom domain, `tenantSlug` set) the flow runs on the apex instead,
// where the provider's redirect URI is registered, and comes back to the
// unit's pages under /o/<slug> (paths every host shares, like /start or
// /auth/mobile/begin, stay as they are).
export function signInHref(
  provider: SocialProviderId,
  next: string | null | undefined,
  opts: { tenantSlug?: string | null; apexOrigin: string },
): string {
  let target = next ?? null;
  let origin = "";
  if (opts.tenantSlug) {
    origin = opts.apexOrigin;
    const path = target && target.startsWith("/") && !target.startsWith("//") ? target : "/";
    const shared = path.startsWith("/auth/") || TENANT_PASSTHROUGH_PREFIXES.some((p) => path.startsWith(p));
    target = shared ? path : `/o/${opts.tenantSlug}${path === "/" ? "" : path}`;
  }
  const q = target ? `?next=${encodeURIComponent(target)}` : "";
  return `${origin}/api/auth/${provider}/begin${q}`;
}
