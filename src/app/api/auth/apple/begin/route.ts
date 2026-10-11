// GET /api/auth/apple/begin?next=/path — start Sign in with Apple.

import { NextResponse, type NextRequest } from "next/server";
import { appleConfigured } from "@/lib/auth/providers";
import { beginSocial } from "@/lib/auth/social-routes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!appleConfigured()) {
    return new NextResponse("Apple sign-in isn't configured here.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return beginSocial("apple", req);
}
