// Route helpers for "Continue with Google/Apple".
//
// /api/auth/<provider>/begin starts the flow through Better Auth and
// /api/auth/<provider>/callback (the redirect URI already registered with
// the provider) is handed to Better Auth's callback handler. Better Auth
// checks state + PKCE, verifies Apple's id_token against Apple's keys,
// links by verified email and creates the session.

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "./auth";
import { isSafeNextPath } from "./post-login";

export type SocialProvider = "google" | "apple";

export const AFTER_SIGN_IN = "/auth/after-sign-in";
// Remembers ?next across Google/Apple for the second-step page, which the
// provider's callback redirects to without it.
export const NEXT_COOKIE = "compass_next";

export function afterSignInPath(next: string | null | undefined): string {
  return isSafeNextPath(next) ? `${AFTER_SIGN_IN}?next=${encodeURIComponent(next!)}` : AFTER_SIGN_IN;
}

export async function beginSocial(provider: SocialProvider, req: NextRequest): Promise<Response> {
  const res = await auth.api.signInSocial({
    body: {
      provider,
      callbackURL: afterSignInPath(req.nextUrl.searchParams.get("next")),
      errorCallbackURL: "/login",
      disableRedirect: true,
    },
    headers: req.headers,
    asResponse: true,
  });
  if (!res.ok) {
    return new NextResponse("Couldn't start sign-in. Try again.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const { url } = (await res.json()) as { url: string };
  const out = NextResponse.redirect(url);
  for (const c of res.headers.getSetCookie()) out.headers.append("set-cookie", c);
  const next = req.nextUrl.searchParams.get("next");
  if (isSafeNextPath(next)) {
    out.cookies.set(NEXT_COOKIE, next!, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
  } else {
    out.cookies.delete(NEXT_COOKIE);
  }
  return out;
}

export async function forwardCallback(provider: SocialProvider, req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  url.pathname = `/api/auth/callback/${provider}`;
  const body = req.method === "POST" ? await req.arrayBuffer() : undefined;
  return auth.handler(new Request(url, { method: req.method, headers: req.headers, body }));
}
