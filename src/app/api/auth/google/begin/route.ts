// GET /api/auth/google/begin?next=/path — start Google sign-in.

import { NextResponse, type NextRequest } from "next/server";
import { googleConfigured } from "@/lib/auth/providers";
import { beginSocial } from "@/lib/auth/social-routes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return new NextResponse(
      "Google sign-in isn't configured here. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  return beginSocial("google", req);
}
