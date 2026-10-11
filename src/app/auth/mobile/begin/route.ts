// GET /auth/mobile/begin?redirect=compass://auth/callback
//
// The mobile app opens this URL in an in-app browser. If the user
// has a cookie session we mint a fresh API token and redirect
// to the deep-link with ?token=...&userId=...&displayName=... .
// Otherwise we send them to /login?next=/auth/mobile/begin?redirect=...
// so the same in-app browser handles the sign-in round-trip.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { issueToken } from "@/lib/auth/api-token";
import { isProd } from "@/lib/env";
import { allowedMobileRedirect } from "@/lib/auth/mobile-redirect";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const redirectRaw = req.nextUrl.searchParams.get("redirect") ?? "";
  const redirectUrl = allowedMobileRedirect(redirectRaw, isProd());
  if (!redirectUrl) {
    return NextResponse.json({ error: "bad_redirect" }, { status: 400 });
  }

  const { user } = await getSession();
  if (!user) {
    const next = `/auth/mobile/begin?redirect=${encodeURIComponent(redirectRaw)}`;
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(next)}`, req.url),
    );
  }

  const userRow = await prisma.user.findUnique({
    where: { id: user.id },
    select: { displayName: true },
  });

  // Mint a fresh token tagged with the device — we don't get the
  // device label from the mobile app at this point, so use a generic
  // name. Users can rename / revoke from /account/api-tokens.
  const token = await issueToken(user.id, "Mobile device", prisma);

  redirectUrl.searchParams.set("token", token.raw);
  redirectUrl.searchParams.set("userId", user.id);
  redirectUrl.searchParams.set("displayName", userRow?.displayName ?? "");
  return NextResponse.redirect(redirectUrl.toString());
}
