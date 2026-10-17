// POST /account/trails/import — the account page's import form
// (multipart: _csrf, file, into). Puts a saved trail file back, then
// returns to /account/trails saying what came back.

import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { redirectTo } from "@/lib/http/redirect";
import { ApiError } from "@/lib/api/v1";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { MAX_IMPORT_BYTES, importTrail, parseTrailUpload } from "@/lib/journey/trail-file";

export const runtime = "nodejs";

const back = (q: string) => redirectTo(`/account/trails?${q}`, 303);

export async function POST(req: NextRequest) {
  const { user } = await getSession();
  if (!user) return redirectTo("/login?next=/account/trails", 303);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_IMPORT_BYTES + 64 * 1024) return back("error=too_large");
  const form = await req.formData().catch(() => null);
  if (!form || !(await verifyOrigin()) || !(await verifyCsrf(String(form.get("_csrf") ?? "")))) return back("error=expired");
  if (!(await rateLimit(`journey-import:${user.id}`, 20, 60 * 60_000)).ok) return back("error=rate_limited");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return back("error=no_file");
  if (file.size > MAX_IMPORT_BYTES) return back("error=too_large");
  const into = String(form.get("into") ?? "") || undefined;
  try {
    const trail = parseTrailUpload(Buffer.from(await file.arrayBuffer()));
    const { scout, imported } = await importTrail(user, trail, into);
    const q = new URLSearchParams({
      done: scout.id,
      steps: String(imported.steps),
      entries: String(imported.entries),
      photos: String(imported.photos),
      skipped: String(imported.skipped),
    });
    return back(q.toString());
  } catch (e) {
    if (e instanceof ApiError) return back(`error=${encodeURIComponent(e.code)}`);
    throw e;
  }
}
