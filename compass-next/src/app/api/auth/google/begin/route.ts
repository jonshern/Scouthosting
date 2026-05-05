// GET /api/auth/google/begin — start the Google OAuth flow.
//
// Generates a fresh state + PKCE verifier, stashes them in
// short-lived HttpOnly cookies, and redirects the user to Google's
// authorization URL. The state cookie is HMAC-signed so it can't be
// forged at the callback.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { googleAuthUrl, googleConfigured, signState } from "@/lib/auth/oauth";
import { isProd } from "@/lib/env";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "compass_oauth_state";
const VERIFIER_COOKIE = "compass_oauth_verifier";

function shortCookieAttrs() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd(),
    path: "/",
    maxAge: 600, // 10 minutes
  };
}

export async function GET() {
  if (!googleConfigured()) {
    return new NextResponse(
      "Google sign-in isn't configured here. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const { url, state, codeVerifier } = await googleAuthUrl();
  const c = await cookies();
  c.set(STATE_COOKIE, signState(state), shortCookieAttrs());
  c.set(VERIFIER_COOKIE, codeVerifier, shortCookieAttrs());

  return NextResponse.redirect(url.toString());
}
