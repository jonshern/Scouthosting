// /auth/mobile/begin?redirect=compass://auth/callback
//
// The mobile app opens this URL in an in-app browser.
//
// GET: signed out → /login?next=<this URL>, so the same in-app browser
// handles the sign-in round-trip. Signed in → /auth/mobile/confirm,
// which asks "Sign in to the Compass app as <name>?". A plain link to
// this URL therefore never hands a token to anyone by itself.
//
// POST (the confirm page's form, same origin + CSRF): mints an API
// token that expires (lib/auth/api-token.ts) and redirects to the deep
// link with ?token=...&userId=...&displayName=... .

import { NextResponse, type NextRequest } from "next/server";
import { redirectTo } from "@/lib/http/redirect";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { issueToken } from "@/lib/auth/api-token";
import { isProd } from "@/lib/env";
import { allowedMobileRedirect, isWebSigninRedirect, signinTokenName } from "@/lib/auth/mobile-redirect";
import { accountStanding, requirementRedirect, withNext } from "@/lib/auth/requirements";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const redirectRaw = req.nextUrl.searchParams.get("redirect") ?? "";
  if (!allowedMobileRedirect(redirectRaw, isProd())) {
    return NextResponse.json({ error: "bad_redirect" }, { status: 400 });
  }
  const self = `/auth/mobile/begin?redirect=${encodeURIComponent(redirectRaw)}`;

  const { user } = await getSession();
  if (!user) {
    return redirectTo(`/login?next=${encodeURIComponent(self)}`);
  }
  const gate = requirementRedirect(await accountStanding(user.id), { organizerSurface: true });
  if (gate) return redirectTo(withNext(gate, self));

  return redirectTo(`/auth/mobile/confirm?redirect=${encodeURIComponent(redirectRaw)}`);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  if (!(await verifyOrigin()) || !(await verifyCsrf(String(form.get("_csrf") ?? "")))) {
    return NextResponse.json({ error: "bad_request" }, { status: 403 });
  }
  const redirectRaw = String(form.get("redirect") ?? "");
  const redirectUrl = allowedMobileRedirect(redirectRaw, isProd());
  if (!redirectUrl) {
    return NextResponse.json({ error: "bad_redirect" }, { status: 400 });
  }

  const { user } = await getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (requirementRedirect(await accountStanding(user.id), { organizerSurface: true })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Users can rename / revoke from /account/api-tokens.
  const token = await issueToken(user.id, signinTokenName(redirectUrl), prisma);

  const params = new URLSearchParams({
    token: token.raw,
    userId: user.id,
    displayName: user.displayName ?? "",
  });
  if (isWebSigninRedirect(redirectUrl, isProd())) {
    // A website gets the token after "#", which browsers never send to
    // the server or in a Referer header.
    redirectUrl.hash = params.toString();
  } else {
    for (const [k, v] of params) redirectUrl.searchParams.set(k, v);
  }
  return NextResponse.redirect(redirectUrl.toString(), 303);
}
