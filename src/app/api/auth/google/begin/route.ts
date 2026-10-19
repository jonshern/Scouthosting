// GET /api/auth/google/begin?next=/path — start Google.

import type { NextRequest } from "next/server";
import { googleConfigured } from "@/lib/auth/providers";
import { beginSocial } from "@/lib/auth/social-routes";
import { redirectTo } from "@/lib/http/redirect";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // No keys here: the button isn't shown, so an old link goes back to
  // the sign-in page rather than to an error.
  if (!googleConfigured()) {
    const next = req.nextUrl.searchParams.get("next");
    return redirectTo(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return beginSocial("google", req);
}
