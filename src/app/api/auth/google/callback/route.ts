// GET /api/auth/google/callback — finish the Google OAuth flow.
//
// Verifies the state cookie (HMAC-signed) against the `state` query
// param, exchanges the code for tokens via arctic, fetches the user's
// profile from Google's UserInfo endpoint, finds-or-creates a User row
// (linking by verified email), upserts an OAuthAccount, and signs the
// user in via Lucia.
//
// CSRF: not applicable here — the request is initiated by Google, not
// the browser. State verification is what protects this route.

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { googleCallback, googleConfigured, verifyState } from "@/lib/auth/oauth";
import { createSession } from "@/lib/auth/sessions";
import { prisma } from "@/lib/db";
import { isProd } from "@/lib/env";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "compass_oauth_state";
const VERIFIER_COOKIE = "compass_oauth_verifier";

function clearedAttrs() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd(),
    path: "/",
    maxAge: 0,
  };
}

function badRequest(msg: string) {
  return new NextResponse(msg, {
    status: 400,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return new NextResponse("Google OAuth not configured.", { status: 503 });
  }

  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");

  const c = await cookies();
  const signed = c.get(STATE_COOKIE)?.value ?? null;
  const codeVerifier = c.get(VERIFIER_COOKIE)?.value ?? null;
  // Always clear the short-lived cookies — single-use only.
  c.set(STATE_COOKIE, "", clearedAttrs());
  c.set(VERIFIER_COOKIE, "", clearedAttrs());

  const storedState = verifyState(signed);
  if (!code || !stateParam || !storedState || stateParam !== storedState || !codeVerifier) {
    return badRequest("Invalid OAuth state.");
  }

  let profile;
  try {
    profile = await googleCallback(code, codeVerifier);
  } catch {
    return badRequest("Token exchange failed.");
  }

  if (!profile.email || !profile.email_verified) {
    return badRequest("Your Google account doesn't have a verified email — we can't link it.");
  }

  const email = profile.email.toLowerCase();
  const sub = profile.sub;
  const displayName = profile.name || email.split("@")[0];

  // Try to find an existing OAuthAccount; otherwise link by verified
  // email or create a new user. Mirrors the Express flow in
  // server/index.js#/auth/google/callback.
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: sub } },
    include: { user: true },
  });

  let userId: string;
  if (existing) {
    userId = existing.userId;
  } else {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, displayName, emailVerified: true },
      });
      // Same auto-link as password signup: founding leader claims their org.
      const ownedOrgs = await prisma.org.findMany({
        where: { scoutmasterEmail: email },
        select: { id: true },
      });
      if (ownedOrgs.length) {
        await prisma.orgMembership.createMany({
          data: ownedOrgs.map((o) => ({ userId: user!.id, orgId: o.id, role: "admin" })),
          skipDuplicates: true,
        });
        await prisma.org.updateMany({
          where: { id: { in: ownedOrgs.map((o) => o.id) }, ownerId: null },
          data: { ownerId: user.id },
        });
      }
    }
    await prisma.oAuthAccount.create({
      data: { userId: user.id, provider: "google", providerAccountId: sub },
    });
    userId = user.id;
  }

  await createSession(userId);
  return NextResponse.redirect(new URL("/", req.url));
}
