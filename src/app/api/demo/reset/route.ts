import { NextResponse, type NextRequest } from "next/server";
import { isDemoMode } from "@/lib/demo/mode";
import { DemoResetRefused, resetDemo } from "@/lib/demo/reset";
import { tasksTokenOk } from "@/lib/security/tasks-token";

export const dynamic = "force-dynamic";

// Reset the demo now (scripts, a scheduler, or `make demo-reset`).
// Same X-Tasks-Token as /api/cron/run. 404 outside demo mode.
export async function POST(req: NextRequest) {
  if (!isDemoMode()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!tasksTokenOk(req.headers.get("x-tasks-token"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const summary = await resetDemo({ reason: "api" });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    if (e instanceof DemoResetRefused) return NextResponse.json({ error: "refused", message: e.message }, { status: 409 });
    throw e;
  }
}
