// OAuth provider wiring (Google + Apple) for compass-next.
//
// Mirrors the Compass Express implementation at `lib/oauth.js`.
//
// We support Google and Apple sign-in. Both use `arctic` clients
// configured via env vars; if a provider's creds are missing the client
// is null and the routes that depend on it return 503.
//
// Apple's flow is materially different from Google's:
//   - The client_secret is an ES256-signed JWT, not a static secret.
//     arctic's Apple constructor takes the private key + key id + team
//     id and builds the JWT each request.
//   - Apple posts the callback (form_post mode) when name/email scopes
//     are requested.
//   - User profile (name, email) only arrives on the first sign-in via
//     the form-post body — subsequent sign-ins return only the `sub`
//     claim.
//
// Apple is currently a stub here — full JWT verify lives in the Express
// implementation; the Next.js callback shape is in place so we can wire
// it up later.

import { Apple, Google } from "arctic";
import crypto from "node:crypto";

function envOrNull(...names: string[]): string | null {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

/* ------------------ Google ------------------ */

function buildGoogle(): Google | null {
  const id = envOrNull("GOOGLE_CLIENT_ID");
  const secret = envOrNull("GOOGLE_CLIENT_SECRET");
  const redirect = envOrNull("GOOGLE_REDIRECT_URI");
  if (!id || !secret || !redirect) return null;
  return new Google(id, secret, redirect);
}

export const googleConfigured = (): boolean =>
  !!(envOrNull("GOOGLE_CLIENT_ID") && envOrNull("GOOGLE_CLIENT_SECRET") && envOrNull("GOOGLE_REDIRECT_URI"));

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

export interface GoogleAuthUrl {
  url: URL;
  state: string;
  codeVerifier: string;
}

/**
 * Build the Google authorization URL. Returns the URL alongside the
 * `state` and `codeVerifier` so the caller can stash them in cookies
 * for verification on the callback.
 */
export async function googleAuthUrl(state?: string): Promise<GoogleAuthUrl> {
  const g = buildGoogle();
  if (!g) throw new Error("Google OAuth not configured");
  const { generateCodeVerifier, generateState } = await import("arctic");
  const finalState = state ?? generateState();
  const codeVerifier = generateCodeVerifier();
  const url = await g.createAuthorizationURL(finalState, codeVerifier, {
    scopes: ["openid", "profile", "email"],
  });
  return { url, state: finalState, codeVerifier };
}

/**
 * Exchange the authorization code for tokens and fetch the user's
 * profile from Google's UserInfo endpoint. Caller is responsible for
 * verifying `state` against the stored cookie before calling this.
 */
export async function googleCallback(
  code: string,
  codeVerifier: string,
): Promise<GoogleProfile> {
  const g = buildGoogle();
  if (!g) throw new Error("Google OAuth not configured");
  const tokens = await g.validateAuthorizationCode(code, codeVerifier);
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
  if (!r.ok) {
    throw new Error(`Google userinfo failed: ${r.status}`);
  }
  return (await r.json()) as GoogleProfile;
}

/* ------------------ Apple (stub) ------------------ */

function applePrivateKeyBytes(): Buffer | null {
  const pemRaw = envOrNull("APPLE_PRIVATE_KEY", "APPLE_PRIVATE_KEY_PEM");
  if (!pemRaw) return null;
  const pem = pemRaw.replace(/\\n/g, "\n");
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  return Buffer.from(body, "base64");
}

function buildApple(): Apple | null {
  const id = envOrNull("APPLE_CLIENT_ID");
  const teamId = envOrNull("APPLE_TEAM_ID");
  const keyId = envOrNull("APPLE_KEY_ID");
  const cert = applePrivateKeyBytes();
  const redirect = envOrNull("APPLE_REDIRECT_URI");
  if (!id || !teamId || !keyId || !cert || !redirect) return null;
  // arctic's Apple credentials type expects `certificate: string` in the
  // typings but accepts the raw key bytes at runtime — same as the
  // Express implementation. Cast through `unknown` to satisfy TS.
  return new Apple(
    {
      clientId: id,
      teamId,
      keyId,
      certificate: cert as unknown as string,
    },
    redirect,
  );
}

export const appleConfigured = (): boolean =>
  !!(
    envOrNull("APPLE_CLIENT_ID") &&
    envOrNull("APPLE_TEAM_ID") &&
    envOrNull("APPLE_KEY_ID") &&
    envOrNull("APPLE_PRIVATE_KEY", "APPLE_PRIVATE_KEY_PEM") &&
    envOrNull("APPLE_REDIRECT_URI")
  );

export interface AppleAuthUrl {
  url: URL;
  state: string;
}

/**
 * Build the Apple authorization URL. Apple's auth code flow doesn't use
 * PKCE — only `state` is used for CSRF protection. We still request
 * the name and email scopes; callers should set response_mode=form_post
 * on the URL since Apple POSTs the callback when those scopes are
 * present.
 */
export async function appleAuthUrl(state?: string): Promise<AppleAuthUrl> {
  const a = buildApple();
  if (!a) throw new Error("Apple OAuth not configured");
  const { generateState } = await import("arctic");
  const finalState = state ?? generateState();
  const url = await a.createAuthorizationURL(finalState, { scopes: ["name", "email"] });
  url.searchParams.set("response_mode", "form_post");
  return { url, state: finalState };
}

/**
 * Decode (without verifying — TODO) the id_token Apple returns. Apple's
 * id_token is signed by Apple; production code should fetch the JWKS
 * from `https://appleid.apple.com/auth/keys` and verify the signature
 * + claims (iss, aud, exp). For now we just decode and return the
 * payload — see the Express `lib/oauth.js#decodeAppleIdToken` for the
 * same approach. Callers should treat this as untrusted until full
 * verification lands.
 */
export interface AppleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
  iss?: string;
  aud?: string;
  exp?: number;
}

export function decodeAppleIdToken(idToken: string): AppleIdTokenClaims {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Apple id_token has wrong shape");
  const padded = parts[1] + "===".slice((parts[1].length + 3) % 4);
  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json) as AppleIdTokenClaims;
}

export async function appleCallback(code: string): Promise<AppleIdTokenClaims> {
  const a = buildApple();
  if (!a) throw new Error("Apple OAuth not configured");
  const tokens = await a.validateAuthorizationCode(code);
  // TODO: verify id_token signature against Apple's JWKS before trusting.
  return decodeAppleIdToken(tokens.idToken);
}

/* ------------------ State cookie sign / verify ------------------- */

const STATE_SECRET_ENV = "SESSION_SECRET";

function stateSecret(): string {
  return process.env[STATE_SECRET_ENV] || "dev-only-not-secret";
}

/**
 * Sign an OAuth state value with HMAC-SHA256. Used so the state cookie
 * can't be forged by an attacker who controls the browser. Format:
 * `<state>.<sig>` where sig is the base64url-encoded HMAC.
 */
export function signState(state: string): string {
  const sig = crypto
    .createHmac("sha256", stateSecret())
    .update(state)
    .digest("base64url");
  return `${state}.${sig}`;
}

/**
 * Verify a signed state value and return the underlying state, or null
 * if the signature is invalid or the format is wrong.
 */
export function verifyState(signed: string | null | undefined): string | null {
  if (!signed) return null;
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const state = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(state)
    .digest("base64url");
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return state;
}
