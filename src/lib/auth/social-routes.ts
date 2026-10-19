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
    // Headers only: Better Auth then builds the redirect URI from the Host
    // with https, or http for localhost, the same rule
    // withSignInScheme gives the callback.
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
  // After out.cookies: it rewrites the Set-Cookie header from its own
  // list, which would drop Better Auth's state cookie and fail every
  // callback with state_mismatch.
  for (const c of res.headers.getSetCookie()) out.headers.append("set-cookie", c);
  return out;
}

export async function forwardCallback(provider: SocialProvider, req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  url.pathname = `/api/auth/callback/${provider}`;
  const body = req.method === "POST" ? await req.arrayBuffer() : undefined;
  return auth.handler(await withSignInScheme(new Request(url, { method: req.method, headers: req.headers, body })));
}

function isLoopbackHost(host: string): boolean {
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  return name === "localhost" || name.endsWith(".localhost") || name === "::1" || name.startsWith("127.");
}

/**
 * The request with the scheme Better Auth should see: http for localhost,
 * https for every other host. The provider's redirect URI is built from
 * it, and must match the one sent at the start. The request's own scheme
 * can't be trusted for that: behind the Mac's switch it's whatever
 * X-Forwarded-Proto says, and `tailscale serve` may not send one.
 */
export async function withSignInScheme(req: Request): Promise<Request> {
  const url = new URL(req.url);
  const host = req.headers.get("host") ?? url.host;
  const scheme = isLoopbackHost(host) ? "http:" : "https:";
  if (url.protocol === scheme) return req;
  url.protocol = scheme;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  return new Request(url, { method: req.method, headers: req.headers, body, redirect: "manual" });
}
