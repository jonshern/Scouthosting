// POST /api/auth/apple/callback — the redirect URI registered with Apple
// (APPLE_REDIRECT_URI). Apple posts the result (response_mode=form_post);
// Better Auth verifies the id_token against Apple's published keys before
// trusting any claim in it.

import { NextResponse, type NextRequest } from "next/server";
import { appleConfigured } from "@/lib/auth/providers";
import { forwardCallback } from "@/lib/auth/social-routes";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  if (!appleConfigured()) {
    return new NextResponse("Apple OAuth not configured.", { status: 501 });
  }
  return forwardCallback("apple", req);
}

export const POST = handle;
export const GET = handle;
