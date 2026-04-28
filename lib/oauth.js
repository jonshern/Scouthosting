// OAuth provider configuration.
//
// Phase 1 supports Google. Other providers (Apple, Microsoft) plug into
// the same pattern: build an `arctic` client with creds from env, and
// add a routes pair to server/index.js.

import "dotenv/config";
import { Google } from "arctic";

function envOrNull(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

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
