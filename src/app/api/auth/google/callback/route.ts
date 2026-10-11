// GET /api/auth/google/callback — the redirect URI registered with Google
// (GOOGLE_REDIRECT_URI). Handed to Better Auth, which finishes sign-in.

import { NextResponse, type NextRequest } from "next/server";
import { googleConfigured } from "@/lib/auth/providers";
import { forwardCallback } from "@/lib/auth/social-routes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return new NextResponse("Google OAuth not configured.", { status: 503 });
  }
  return forwardCallback("google", req);
}
