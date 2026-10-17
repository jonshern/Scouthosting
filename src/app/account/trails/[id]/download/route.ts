// GET /account/trails/<scoutId>/download?format=json|xlsx|zip — the
// account page's download links (the cookie session's version of
// /api/v1/journey/scouts/<id>/export). Lantern on a phone opens
// /account/trails in its browser to get here.

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { redirectTo } from "@/lib/http/redirect";
import { ApiError } from "@/lib/api/v1";
import { downloadResponse, trailDownload } from "@/lib/journey/trail-file";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await getSession();
  if (!user) return redirectTo("/login?next=/account/trails");
  const { id } = await params;
  const raw = req.nextUrl.searchParams.get("format");
  const format = raw === "xlsx" || raw === "zip" ? raw : "json";
  try {
    return downloadResponse(await trailDownload(user, id, format));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
