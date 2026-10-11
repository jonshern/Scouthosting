// Google + Apple provider settings for Better Auth, read from the same
// env vars the arctic implementation used. A provider whose settings are
// missing is left out, and its begin route answers 503.
//
// The redirect URIs stay the ones registered with Google and Apple
// (GOOGLE_REDIRECT_URI → /api/auth/google/callback, APPLE_REDIRECT_URI →
// /api/auth/apple/callback). Those routes hand the request to Better
// Auth's own callback handler, so no console change is needed.

import crypto from "node:crypto";

function envOrNull(...names: string[]): string | null {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

export type GoogleConfig = { clientId: string; clientSecret: string; redirectURI: string };

export function googleConfig(): GoogleConfig | null {
  const clientId = envOrNull("GOOGLE_CLIENT_ID");
  const clientSecret = envOrNull("GOOGLE_CLIENT_SECRET");
  const redirectURI = envOrNull("GOOGLE_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectURI) return null;
  return { clientId, clientSecret, redirectURI };
}

export const googleConfigured = (): boolean => googleConfig() !== null;

export type AppleConfig = {
  clientId: string;
  clientSecret: string;
  redirectURI: string;
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
  const redirectURI = envOrNull("APPLE_REDIRECT_URI");
  if (!clientId || !teamId || !keyId || !privateKeyPem || !redirectURI) return null;
  const appBundleIdentifier = envOrNull("APPLE_APP_BUNDLE_ID") ?? undefined;
  return {
    clientId,
    clientSecret: appleClientSecret({ teamId, keyId, clientId, privateKeyPem }),
    redirectURI,
    ...(appBundleIdentifier ? { appBundleIdentifier } : {}),
  };
}

export const appleConfigured = (): boolean =>
  !!(
    envOrNull("APPLE_CLIENT_ID") &&
    envOrNull("APPLE_TEAM_ID") &&
    envOrNull("APPLE_KEY_ID") &&
    applePrivateKeyPem() &&
    envOrNull("APPLE_REDIRECT_URI")
  );
