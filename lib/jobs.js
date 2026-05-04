// Background job queue. Wraps pg-boss with a small adapter so the rest
// of the app talks `enqueueJob(name, data, opts)` regardless of whether
// the queue is actually running.
//
// Why pg-boss: Compass already has a Postgres dependency in every
// environment; pg-boss reuses it (no new infrastructure, no Redis to
// stand up, transactional with the rest of the schema). It's not the
// fastest queue — BullMQ wins on raw throughput — but for this app's
// volume (handful of jobs/sec under load) Postgres-backed is plenty
// and the operational cost is zero.
//
// Three runtime modes:
//   1. "queued"     → pg-boss is up, enqueueJob persists + returns; a
//                     worker picks it up and runs the registered handler
//   2. "in-process" → pg-boss isn't started (no DATABASE_URL, JOBS_DISABLED=1,
//                     or test env). enqueueJob runs the handler synchronously
//                     in the calling request. Same observable behaviour;
//                     no retry, no isolation. Simplest path for tests +
//                     local dev without a worker.
//   3. "discarded"  → enqueueJob with a name no one registered logs a
//                     warning and drops. Beats throwing — a queued job
//                     dropping shouldn't fail an admin action.
//
// New job types are added by calling `registerHandler(name, async (data) => …)`
// at module init. The handler receives the deserialised job data and a
// context object ({ logger, ... }). Throwing causes pg-boss to retry per
// the policy on enqueue (default: 3 retries with exponential backoff).
//
// `JOBS_DISABLED=1` is the pod-level kill switch — same shape as
// `CRON_DISABLED=1`. Set on N-1 pods in a multi-pod deploy so only one
// pod runs the worker side; every pod can still enqueue.

import { logger as defaultLogger } from "./log.js";

const log = defaultLogger.child("jobs");

// In-memory handler registry. Populated by registerHandler() at module
// init time, before startJobsRuntime() is called.
const handlers = new Map();

// The active runtime. `null` until startJobsRuntime() is called; in
// in-process / test mode stays null and enqueueJob runs handlers
// synchronously.
let runtime = null;

/**
 * Register a handler for a job name. Idempotent — re-registering the
 * same name overwrites (helpful in tests). Handlers are looked up at
 * enqueue time (in-process mode) and at job-pickup time (queued mode).
 *
 * @param {string} name           e.g. "email.send"
 * @param {(data, ctx) => Promise<void>} fn
 */
export function registerHandler(name, fn) {
  if (typeof name !== "string" || !name) throw new Error("registerHandler: name required");
  if (typeof fn !== "function") throw new Error("registerHandler: fn must be a function");
  handlers.set(name, fn);
}

/**
 * Enqueue a job. In queued mode persists to pg-boss and returns the
 * job id. In in-process mode runs the handler synchronously and returns
 * `{ id: null, mode: "in-process" }`. Either way the caller can
 * `await` it without caring which mode is active.
 *
 * @param {string} name
 * @param {object} data
 * @param {object} [opts]
 *   - retryLimit  (default 3)
 *   - startAfter  Date|number — schedule for later
 * @returns {Promise<{ id: string|null, mode: "queued"|"in-process"|"discarded" }>}
 */
export async function enqueueJob(name, data = {}, opts = {}) {
  const handler = handlers.get(name);

  if (runtime?.boss) {
    // Queued path. pg-boss handles dispatch; handler is invoked by the
    // worker registered in startJobsRuntime().
    const sendOpts = {
      retryLimit: opts.retryLimit ?? 3,
      retryBackoff: true,
      ...(opts.startAfter ? { startAfter: opts.startAfter } : {}),
    };
    try {
      const id = await runtime.boss.send(name, data, sendOpts);
      return { id, mode: "queued" };
    } catch (err) {
      log.warn("pg-boss send failed; falling back to in-process", { name, err: err && err.message });
      // Fall through to in-process so the work isn't dropped.
    }
  }

  if (!handler) {
    log.warn("enqueueJob: no handler registered; dropping", { name });
    return { id: null, mode: "discarded" };
  }
  await handler(data, { logger: log.child(name) });
  return { id: null, mode: "in-process" };
}

/**
 * Boot the queue. Lazy-imports pg-boss so test environments that don't
 * touch jobs don't pay the require cost. Returns the runtime object;
 * stash it somewhere if you want to call `runtime.stop()` on shutdown.
 *
 * Skips entirely (returns null) when:
 *   - JOBS_DISABLED=1
 *   - no DATABASE_URL
 *   - NODE_ENV=test
 *
 * Idempotent — calling twice in the same process returns the same
 * runtime; the worker isn't started twice.
 *
 * @param {{ databaseUrl?: string, logger?: object }} [opts]
 */
export async function startJobsRuntime(opts = {}) {
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
  if (process.env.NODE_ENV === "test") {
    return null;
  }

  let PgBoss;
  try {
    PgBoss = (await import("pg-boss")).default;
  } catch (err) {
    log.warn("pg-boss not installed; jobs run in-process", { err: err && err.message });
    return null;
  }

  const boss = new PgBoss({
    connectionString: databaseUrl,
    // Newer pg-boss schemas live in their own namespace so they don't
    // collide with the app schema. Default schema name is "pgboss".
  });
  boss.on("error", (err) => log.error("pg-boss error", { err: err && err.message }));
  await boss.start();

  // Register a worker for every handler we know about. pg-boss will
  // dispatch incoming jobs on each name. Workers added later (after
  // startJobsRuntime) won't be picked up — keep your registerHandler
  // calls at module init.
  for (const [name, fn] of handlers.entries()) {
    await boss.work(name, async (jobs) => {
      // pg-boss v10+ delivers an array of jobs to the work callback.
      for (const job of jobs) {
        try {
          await fn(job.data, { logger: log.child(name), jobId: job.id });
        } catch (err) {
          log.warn("job failed (will retry per retryLimit)", {
            name,
            jobId: job.id,
            err: err && err.message,
          });
          throw err; // rethrow so pg-boss records the failure + retries
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

/**
 * Visible state for /__super pages + tests. Returns whether pg-boss is
 * running and the registered handler names.
 */
export function jobsStatus() {
  return {
    running: !!runtime?.boss,
    handlers: Array.from(handlers.keys()),
  };
}

// Test-only escape hatch: clear the runtime + registry so each test
// starts clean. Not exported in the public surface; tests reach in via
// `import * as jobs from "..."`.
export function _resetForTests() {
  runtime = null;
  handlers.clear();
}

/* ------------------------------------------------------------------ */
/* Built-in handlers                                                  */
/* ------------------------------------------------------------------ */

// `email.send` — schedule an email for background delivery. Decouples
// the request thread from SMTP latency; failed sends retry per the
// pg-boss policy. Use this instead of calling lib/mail.js#send
// directly when the email is fire-and-forget (welcome, password-reset
// confirmation, broadcast follow-ups).
//
// Synchronous code paths (where the user is waiting on the response
// to know whether the send worked) should keep calling send() directly.
registerHandler("email.send", async (data, ctx) => {
  const { send } = await import("./mail.js");
  const result = await send(data);
  if (!result.ok) {
    // Throw so pg-boss retries; the queue will give up after retryLimit
    // and surface in pg-boss's failed-jobs view.
    throw new Error(`email.send failed: ${result.error || "unknown"}`);
  }
  ctx.logger.info("email sent", { to: Array.isArray(data.to) ? data.to.length : 1, id: result.id });
});
