// GET /auth/after-sign-in?next=/path — where Google/Apple sign-in lands.
// Sends the user to the same place a password sign-in would.

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { postLoginRedirectUrl } from "@/lib/auth/post-login";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user } = await getSession();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const dest = await postLoginRedirectUrl(user.id, req.nextUrl.searchParams.get("next"));
  return NextResponse.redirect(new URL(dest, req.url));
}
