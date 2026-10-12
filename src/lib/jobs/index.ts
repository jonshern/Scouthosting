// Background job queue. Wraps pg-boss with a small adapter so the
// rest of the app talks `enqueueJob(name, data, opts)` regardless of
// whether the queue is running.
//
// Why pg-boss: Compass already has a Postgres dependency in every
// environment; pg-boss reuses it (no new infra, no Redis, transactional
// with the rest of the schema).
//
// Three runtime modes:
//   1. "queued"     → pg-boss is up; enqueue persists + returns a job id
//   2. "in-process" → pg-boss isn't started (no DATABASE_URL,
//                     JOBS_DISABLED=1, or NODE_ENV=test). enqueueJob
//                     runs the handler synchronously in the calling
//                     request; same observable behaviour, no retry.
//   3. "discarded"  → no handler registered for that name; logs and drops.
//
// Add new job types by calling `registerHandler(name, async fn)` at
// module init. Handlers receive (data, ctx) where ctx.logger is a
// child logger.
//
// `JOBS_DISABLED=1` is the pod-level kill switch — set on N-1 pods so
// only one pod runs the worker side. Every pod can still enqueue.

import { logger as defaultLogger } from "@/lib/log";
import { handlers, registerHandler } from "./registry";

export { registerHandler } from "./registry";
export type { JobHandler, JobHandlerCtx } from "./registry";

const log = defaultLogger.child("jobs");

type PgBossLike = {
  send: (name: string, data: unknown, opts: Record<string, unknown>) => Promise<string>;
  work: (
    name: string,
    fn: (jobs: Array<{ id: string; data: unknown }>) => Promise<void>,
  ) => Promise<unknown>;
  createQueue?: (name: string) => Promise<unknown>;
  on: (event: string, fn: (err: Error) => void) => void;
  start: () => Promise<unknown>;
  stop: (opts: { graceful: boolean }) => Promise<unknown>;
};

type Runtime = { boss: PgBossLike; stop: () => Promise<void> };

let runtime: Runtime | null = null;

export type EnqueueResult = {
  id: string | null;
  mode: "queued" | "in-process" | "discarded";
};

export type EnqueueOpts = {
  retryLimit?: number;
  startAfter?: Date | number;
};

export async function enqueueJob(
  name: string,
  data: unknown = {},
  opts: EnqueueOpts = {},
): Promise<EnqueueResult> {
  const handler = handlers.get(name);

  if (runtime?.boss) {
    const sendOpts: Record<string, unknown> = {
      retryLimit: opts.retryLimit ?? 3,
      retryBackoff: true,
      ...(opts.startAfter ? { startAfter: opts.startAfter } : {}),
    };
    try {
      const id = await runtime.boss.send(name, data, sendOpts);
      return { id, mode: "queued" };
    } catch (err) {
      log.warn("pg-boss send failed; falling back to in-process", {
        name,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!handler) {
    log.warn("enqueueJob: no handler registered; dropping", { name });
    return { id: null, mode: "discarded" };
  }
  await handler(data, { logger: log.child(name) });
  return { id: null, mode: "in-process" };
}

export async function startJobsRuntime(opts: { databaseUrl?: string } = {}): Promise<Runtime | null> {
  if (runtime) return runtime;
  const databaseUrl = opts.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) {
    log.info("no DATABASE_URL; jobs run in-process");
    return null;
  }
  if (process.env.JOBS_DISABLED === "1") {
    log.info("JOBS_DISABLED=1; jobs run in-process on this pod");
    return null;
  }
  if (process.env.NODE_ENV === "test") return null;

  let PgBoss: new (opts: { connectionString: string; max?: number }) => PgBossLike;
  try {
    const mod = (await import("pg-boss")) as {
      PgBoss?: new (opts: { connectionString: string; max?: number }) => PgBossLike;
      default?: new (opts: { connectionString: string; max?: number }) => PgBossLike;
    };
    const Ctor = mod.PgBoss || mod.default;
    if (typeof Ctor !== "function") {
      throw new Error("pg-boss module did not expose a PgBoss class");
    }
    PgBoss = Ctor;
  } catch (err) {
    log.warn("pg-boss not installed; jobs run in-process", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  // pg-boss defaults to a pool of 10 per process, which alone would
  // exhaust the Cloud SQL budget (see src/lib/db.ts).
  const boss = new PgBoss({ connectionString: databaseUrl, max: jobsPoolSize() });
  boss.on("error", (err) => log.error("pg-boss error", { err: err.message }));
  await boss.start();

  for (const [name, fn] of handlers.entries()) {
    // pg-boss v12 requires explicit queue creation before work().
    // Older versions ignore this call; the optional chain keeps both
    // paths happy.
    if (boss.createQueue) {
      try {
        await boss.createQueue(name);
      } catch (err) {
        // Idempotent: ignore "already exists" failures.
        log.debug("createQueue", { name, err: err instanceof Error ? err.message : String(err) });
      }
    }
    await boss.work(name, async (jobs) => {
      for (const job of jobs) {
        try {
          await fn(job.data, { logger: log.child(name), jobId: job.id });
        } catch (err) {
          log.warn("job failed (will retry per retryLimit)", {
            name,
            jobId: job.id,
            err: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      }
    });
  }

  runtime = {
    boss,
    stop: async () => {
      await boss.stop({ graceful: true });
      runtime = null;
    },
  };
  log.info("jobs runtime started", { handlers: Array.from(handlers.keys()) });
  return runtime;
}

export function jobsStatus(): { running: boolean; handlers: string[] } {
  return {
    running: !!runtime?.boss,
    handlers: Array.from(handlers.keys()),
  };
}

export function _resetForTests(): void {
  runtime = null;
  handlers.clear();
}

// Touch registerHandler to keep the re-export's types alive even if
// no caller uses it from this module directly. (Handlers are registered
// in side-effect modules like ./handlers.)
void registerHandler;

// Side-effect import: built-in handlers register themselves at module
// init. Kept at the bottom so the registry above is fully exported by
// the time handlers.ts evaluates.
import "./handlers";

export function jobsPoolSize(env: Record<string, string | undefined> = process.env): number {
  return Math.max(1, Math.floor(Number(env.JOBS_POOL_SIZE)) || 2);
}
