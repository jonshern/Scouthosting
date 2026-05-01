// OAuth provider configuration.
//
// We support Google and Apple sign-in. Both use `arctic` clients
// configured via env vars; if a provider's creds are missing the
// client is null and the routes that depend on it return 503.
//
// Apple's flow is materially different from Google's:
//   - The client_secret is an ES256-signed JWT, not a static secret.
//     arctic's Apple constructor takes the private key + key id + team
//     id and builds the JWT each request.
//   - Apple posts the callback (form_post mode by default), not GETs
//     it. server/index.js handles both.
//   - User profile (name, email) only arrives on the first sign-in via
//     the form-post body — subsequent sign-ins return only the `sub`
//     claim. We snapshot what we get into User.displayName / email so
//     downstream logic doesn't care.

import "dotenv/config";
import { Google, Apple } from "arctic";

function envOrNull(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

/* ------------------ Google ------------------ */

const GOOGLE_CLIENT_ID = envOrNull("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = envOrNull("GOOGLE_CLIENT_SECRET");
const GOOGLE_REDIRECT_URI = envOrNull("GOOGLE_REDIRECT_URI");

export const googleOAuth =
  GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI
    ? new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
    : null;

export const googleConfigured = !!googleOAuth;

/**
 * Fetch the user's profile from Google's UserInfo endpoint.
 * Returns: { sub, email, email_verified, name, picture, given_name, family_name }
 */
export async function fetchGoogleProfile(accessToken) {
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) {
    throw new Error(`Google userinfo failed: ${r.status}`);
  }
  return r.json();
}

/* ------------------ Apple ------------------ */

const APPLE_CLIENT_ID = envOrNull("APPLE_CLIENT_ID");
const APPLE_TEAM_ID = envOrNull("APPLE_TEAM_ID");
const APPLE_KEY_ID = envOrNull("APPLE_KEY_ID");
const APPLE_PRIVATE_KEY_PEM = envOrNull("APPLE_PRIVATE_KEY", "APPLE_PRIVATE_KEY_PEM");
const APPLE_REDIRECT_URI = envOrNull("APPLE_REDIRECT_URI");

function applePrivateKeyBytes() {
  if (!APPLE_PRIVATE_KEY_PEM) return null;
  // arctic expects the raw key bytes. Strip PEM headers/whitespace and
  // base64-decode. Tolerates both newline-preserved and \n-escaped envs
  // (Fly / Render typically escape).
  const pem = APPLE_PRIVATE_KEY_PEM.replace(/\\n/g, "\n");
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  return Buffer.from(body, "base64");
}

export const appleOAuth =
  APPLE_CLIENT_ID && APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY_PEM && APPLE_REDIRECT_URI
    ? new Apple(
        {
          clientId: APPLE_CLIENT_ID,
          teamId: APPLE_TEAM_ID,
          keyId: APPLE_KEY_ID,
          certificate: applePrivateKeyBytes(),
        },
        APPLE_REDIRECT_URI,
      )
    : null;

export const appleConfigured = !!appleOAuth;

/**
 * Decode the id_token (a JWT) Apple returns. Apple's id_token is
 * already verified by arctic; we just need to extract the claims.
 *
 * Returns: { sub, email, email_verified, is_private_email }
 *
 * Note: name doesn't live in the id_token — it's only in the form-post
 * `user` field on the very first sign-in. Caller passes that in
 * separately when present.
 */
export function decodeAppleIdToken(idToken) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Apple id_token has wrong shape");
  const padded = parts[1] + "===".slice((parts[1].length + 3) % 4);
  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json);
}
