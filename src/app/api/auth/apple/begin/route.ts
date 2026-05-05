// GET /api/auth/apple/begin — start the Apple Sign-in flow.
//
// Stub: full implementation lives in the Express server today. The
// route shape is in place so we can wire it up once Apple credentials
// are configured. When unconfigured we return 501.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appleAuthUrl, appleConfigured, signState } from "@/lib/auth/oauth";
import { isProd } from "@/lib/env";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "compass_oauth_state";

function shortCookieAttrs() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd(),
    path: "/",
    maxAge: 600,
  };
}

export async function GET() {
  if (!appleConfigured()) {
    return new NextResponse("Apple sign-in is not configured here.", {
      status: 501,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const { url, state } = await appleAuthUrl();
  const c = await cookies();
  c.set(STATE_COOKIE, signState(state), shortCookieAttrs());
  return NextResponse.redirect(url.toString());
}
