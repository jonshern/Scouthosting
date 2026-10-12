import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { runCronTick } from "@/lib/newsletter/cron";
import { maybeResetDemo } from "@/lib/demo/reset";
import { logger } from "@/lib/log";
import { tasksTokenOk } from "@/lib/security/tasks-token";

export const dynamic = "force-dynamic";

// Cloud Scheduler calls this hourly with X-Tasks-Token. One tick drafts
// due newsletters, fires newsletter rules and runs retention cleanup.
// On a demo deployment it also resets the demo once a day.
export async function POST(req: NextRequest) {
  if (!tasksTokenOk(req.headers.get("x-tasks-token"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await runCronTick({ prismaClient: prisma, logger: logger.child("cron") });
  const demo = await maybeResetDemo();
  return NextResponse.json({ ok: true, ...result, ...(demo ? { demoReset: true } : {}) });
}
