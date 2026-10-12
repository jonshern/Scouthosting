// Put the demo back the way it started: wipe every table, then seed the
// demo unit again (./seed.ts).
//
// Runs when the demo deployment boots with no demo unit, on the hourly
// cron tick once the unit is older than DEMO_RESET_HOURS (default 24),
// and on demand from /demo (signed in as the demo admin) or
// POST /api/demo/reset with the X-Tasks-Token header.
//
// The wipe uses DELETE, not TRUNCATE, because the app's database login
// only has row access (scripts/migrate.sh). It refuses unless DEMO_MODE=1
// and every unit in the database is a demo unit, so pointing a demo
// deployment at a real database fails closed.

import { prisma } from "@/lib/db";
import { logger } from "@/lib/log";
import { demoResetHours, isDemoMode } from "./mode";
import { seedDemo, type SeedSummary } from "./seed";

const log = logger.child("demo");

export class DemoResetRefused extends Error {}

/** Tables the reset never touches. */
const KEEP_TABLES = new Set(["_prisma_migrations"]);

export async function demoTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    select tablename from pg_tables where schemaname = current_schema() order by tablename`;
  // Foreign keys that block a delete (RESTRICT / NO ACTION) decide the order.
  const blockers = await prisma.$queryRaw<Array<{ child: string; parent: string }>>`
    select c.relname as child, p.relname as parent
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_class p on p.oid = k.confrelid
      join pg_namespace n on n.oid = c.relnamespace
     where k.contype = 'f' and k.confdeltype in ('r', 'a') and n.nspname = current_schema()`;
  return orderForDelete(
    rows.map((r) => r.tablename).filter((t) => !KEEP_TABLES.has(t)),
    blockers.map((b) => [b.child, b.parent] as [string, string]),
  );
}

/** Tables ordered so each comes before any table it blocks the delete of. */
export function orderForDelete(tables: string[], blocks: Array<[child: string, parent: string]>): string[] {
  const out: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const childrenOf = (t: string) => blocks.filter(([, parent]) => parent === t).map(([child]) => child);
  const visit = (t: string) => {
    if (done.has(t) || visiting.has(t) || !tables.includes(t)) return;
    visiting.add(t);
    for (const c of childrenOf(t)) visit(c);
    visiting.delete(t);
    done.add(t);
    out.push(t);
  };
  for (const t of tables) visit(t);
  return out;
}

/**
 * DELETE every row of every table, in the order demoTables() gives. If
 * a delete still fails (a foreign key added after that order was
 * worked out), it's retried after the others until a round makes no
 * progress.
 */
export async function wipeTables(
  tables: string[],
  exec: (sql: string) => Promise<unknown>,
): Promise<void> {
  let pending = [...tables];
  while (pending.length) {
    const failed: string[] = [];
    let lastError: unknown = null;
    for (const t of pending) {
      if (!/^[A-Za-z0-9_]+$/.test(t)) throw new Error(`unexpected table name ${t}`);
      try {
        await exec(`DELETE FROM "${t}"`);
      } catch (e) {
        failed.push(t);
        lastError = e;
      }
    }
    if (failed.length === pending.length) {
      throw new Error(
        `demo wipe stuck on ${failed.join(", ")}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      );
    }
    pending = failed;
  }
}

export async function assertSafeToReset(): Promise<void> {
  if (!isDemoMode()) throw new DemoResetRefused("DEMO_MODE is not on; refusing to wipe this database.");
  const realUnits = await prisma.org.count({ where: { isDemo: false } });
  if (realUnits > 0) {
    throw new DemoResetRefused(
      `This database has ${realUnits} real unit(s); a demo reset would delete them. Point the demo at its own database.`,
    );
  }
}

let running: Promise<SeedSummary> | null = null;

/** Wipe and re-seed. Concurrent calls in one process share one run. */
export function resetDemo(opts: { now?: Date; reason?: string } = {}): Promise<SeedSummary> {
  if (running) return running;
  running = (async () => {
    const started = Date.now();
    await assertSafeToReset();
    await wipeTables(await demoTables(), (sql) => prisma.$executeRawUnsafe(sql));
    const summary = await seedDemo({ now: opts.now });
    log.info("demo reset", { reason: opts.reason ?? "manual", ms: Date.now() - started, ...summary });
    return summary;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** The demo unit's address and when it was last seeded, or null. */
export async function currentDemoUnit(): Promise<{ slug: string; displayName: string; createdAt: Date } | null> {
  return prisma.org.findFirst({
    where: { isDemo: true },
    orderBy: { createdAt: "desc" },
    select: { slug: true, displayName: true, createdAt: true },
  });
}

export function resetDue(unit: { createdAt: Date } | null, now: Date, hours = demoResetHours()): boolean {
  if (!unit) return true;
  return now.getTime() - unit.createdAt.getTime() >= hours * 60 * 60 * 1000;
}

/**
 * Reset if the demo unit is missing or stale. Safe to call often: it's
 * a no-op outside demo mode and when the data is fresh.
 */
export async function maybeResetDemo(now = new Date()): Promise<SeedSummary | null> {
  if (!isDemoMode()) return null;
  const unit = await currentDemoUnit();
  if (!resetDue(unit, now)) return null;
  return resetDemo({ now, reason: unit ? "scheduled" : "empty" });
}
