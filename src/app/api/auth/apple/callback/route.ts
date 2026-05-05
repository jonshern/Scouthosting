// POST /api/auth/apple/callback — finish the Apple Sign-in flow.
//
// Stub: Apple POSTs the callback (response_mode=form_post) when name
// or email scopes are requested. The full implementation needs to
// verify the id_token signature against Apple's JWKS — TODO. Today we
// reject with 501 unless Apple is configured, in which case we fall
// through to the same find-or-link logic Google uses.
//
// CSRF: not applicable here — request initiated by Apple, not the
// browser. State verification protects the route.

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  appleCallback,
  appleConfigured,
  verifyState,
  type AppleIdTokenClaims,
} from "@/lib/auth/oauth";
import { createSession } from "@/lib/auth/sessions";
import { prisma } from "@/lib/db";
import { isProd } from "@/lib/env";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "compass_oauth_state";

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

export async function POST(req: NextRequest) {
  if (!appleConfigured()) {
    return new NextResponse("Apple OAuth not configured.", { status: 501 });
  }

  const form = await req.formData();
  const code = String(form.get("code") || "");
  const stateParam = String(form.get("state") || "");
  const userBlob = form.get("user");

  const c = await cookies();
  const signed = c.get(STATE_COOKIE)?.value ?? null;
  c.set(STATE_COOKIE, "", clearedAttrs());

  const storedState = verifyState(signed);
  if (!code || !stateParam || !storedState || stateParam !== storedState) {
    return badRequest("Invalid OAuth state.");
  }

  let claims: AppleIdTokenClaims;
  try {
    claims = await appleCallback(code);
  } catch {
    return badRequest("Token exchange failed.");
  }

  if (!claims.email) return badRequest("Apple didn't share a usable email.");

  const email = String(claims.email).toLowerCase();
  const sub = claims.sub;
  // First-sign-in only: Apple posts a `user` JSON blob with name fields.
  let displayName = email.split("@")[0];
  if (typeof userBlob === "string" && userBlob) {
    try {
      const u = JSON.parse(userBlob) as { name?: { firstName?: string; lastName?: string } };
      const composed = `${u?.name?.firstName ?? ""} ${u?.name?.lastName ?? ""}`.trim();
      if (composed) displayName = composed;
    } catch {
      // Malformed user blob — fall back to email-derived name.
    }
  }

  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "apple", providerAccountId: sub } },
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
      data: { userId: user.id, provider: "apple", providerAccountId: sub },
    });
    userId = user.id;
  }

  await createSession(userId);
  return NextResponse.redirect(new URL("/", req.url));
}
