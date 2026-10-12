import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/log";
import { mailDriverName } from "@/lib/mail";

export const dynamic = "force-dynamic";

const log = logger.child("health");

// Uptime checks (Cloud Monitoring, scripts/host/watchdog.sh) call this.
// 503 when the database can't be reached. The error itself goes to the
// log, not the response: this route is public. `mail` says whether
// email actually leaves the server ("console" means it's only logged).
export async function GET() {
  const version = process.env.GIT_SHA?.slice(0, 12) || "dev";
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, version, mail: mailDriverName(), ts: Date.now() }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    log.error("database check failed", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { ok: false, version, error: "database_unreachable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
