import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { runCronTick } from "@/lib/newsletter/cron";
import { logger } from "@/lib/log";

export const dynamic = "force-dynamic";

function tokenOk(given: string | null): boolean {
  const expected = process.env.TASKS_TOKEN;
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Cloud Scheduler calls this hourly with X-Tasks-Token. One tick drafts
// due newsletters, fires newsletter rules and runs retention cleanup.
export async function POST(req: NextRequest) {
  if (!tokenOk(req.headers.get("x-tasks-token"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await runCronTick({ prismaClient: prisma, logger: logger.child("cron") });
  return NextResponse.json({ ok: true, ...result });
}
