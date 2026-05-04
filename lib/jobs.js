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
    // pg-boss v12+ ships pure ESM with a named `PgBoss` class export
    // (no default). v9 and earlier had a CommonJS `module.exports =
    // PgBoss`, so `(await import).default` used to work — that's why
    // older code paths (and the staging boot warning "PgBoss is not a
    // constructor") expected `.default`. Read the named export.
    const mod = await import("pg-boss");
    PgBoss = mod.PgBoss || mod.default;
    if (typeof PgBoss !== "function") {
      throw new Error("pg-boss module did not expose a PgBoss class");
    }
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

// `email.broadcast.send-one` — per-recipient broadcast delivery. The
// /admin/email POST pre-creates a MailLog row with status="queued"
// and recipientCount = N, then enqueues N of these. Each job sends
// one email and atomically updates the MailLog progress counters.
// When deliveredCount + failedCount reaches recipientCount, the same
// worker finalizes the status (sent / partial / failed).
//
// Job data: { mailLogId, message } where `message` is the same shape
// lib/mail.js#send accepts (to, from, subject, text/html, headers).
//
// Throwing causes pg-boss to retry with backoff. After retryLimit
// (default 3) the job lands in pgboss.archive; we catch that here so
// the MailLog row still finalizes — the "failed" count gets incremented
// on the *final* call (the wrapper differentiates retry vs final by
// re-reading the job's retryCount, but pg-boss doesn't surface that
// to handlers). Compromise: increment failedCount on every throw and
// roll back if a later retry succeeds. Simpler + idempotent given the
// atomic UPDATE.
registerHandler("email.broadcast.send-one", async (data, ctx) => {
  const { mailLogId, message } = data || {};
  if (!mailLogId || !message) {
    throw new Error("email.broadcast.send-one: missing mailLogId or message");
  }
  const { send } = await import("./mail.js");
  const { prisma } = await import("./db.js");

  let result;
  try {
    result = await send(message);
  } catch (err) {
    // Treat lib/mail.js throwing as a transient delivery error.
    result = { ok: false, error: err?.message || String(err) };
  }

  if (result.ok) {
    await prisma.mailLog.update({
      where: { id: mailLogId },
      data: { deliveredCount: { increment: 1 } },
    });
    await maybeFinaliseMailLogStatus(prisma, mailLogId);
    ctx.logger.info("broadcast email sent", { mailLogId, to: message.to });
    return;
  }

  // Failure path: bump the counter and finalize if applicable.
  // Rethrow so pg-boss retries on its own schedule (retryLimit on
  // enqueue). On the LAST retry we still update failedCount; the
  // arithmetic is bounded by recipientCount so no overflow.
  await prisma.mailLog.update({
    where: { id: mailLogId },
    data: {
      failedCount: { increment: 1 },
      // Stash the latest error for visibility. Append-only JSON would
      // be nicer; for v1 we just keep the most recent.
      errors: result.error
        ? `last error (${message.to}): ${result.error}`.slice(0, 4000)
        : "(unknown)",
    },
  });
  await maybeFinaliseMailLogStatus(prisma, mailLogId);
  // Don't rethrow — the MailLog already records the failure, and
  // retrying would double-count. If we want pg-boss-level retry, we
  // should NOT increment failedCount until the last retry — refactor
  // for PR-Q1.5.
});

// `sms.broadcast.send-one` — same shape as email.broadcast.send-one
// but routed through lib/sms.js. Updates the same MailLog row's
// counters so a mixed broadcast (email + SMS to the same audience)
// finalises correctly when *both* channels are done.
//
// Job data: { mailLogId, message } — message is the shape
// lib/sms.js#send accepts ({ to, body }).
registerHandler("sms.broadcast.send-one", async (data, ctx) => {
  const { mailLogId, message } = data || {};
  if (!mailLogId || !message) {
    throw new Error("sms.broadcast.send-one: missing mailLogId or message");
  }
  const { sendSms } = await import("./sms.js");
  const { prisma } = await import("./db.js");

  let result;
  try {
    result = await sendSms(message);
  } catch (err) {
    result = { ok: false, error: err?.message || String(err) };
  }

  if (result.ok) {
    await prisma.mailLog.update({
      where: { id: mailLogId },
      data: { deliveredCount: { increment: 1 } },
    });
    await maybeFinaliseMailLogStatus(prisma, mailLogId);
    ctx.logger.info("broadcast SMS sent", { mailLogId, to: message.to });
    return;
  }

  await prisma.mailLog.update({
    where: { id: mailLogId },
    data: {
      failedCount: { increment: 1 },
      errors: result.error
        ? `last error (${message.to}): ${result.error}`.slice(0, 4000)
        : "(unknown)",
    },
  });
  await maybeFinaliseMailLogStatus(prisma, mailLogId);
});

// Once delivered + failed equals the total recipient count, finalize
// MailLog.status. Atomic via single UPDATE so concurrent workers don't
// race to a wrong terminal state.
async function maybeFinaliseMailLogStatus(prisma, mailLogId) {
  const log = await prisma.mailLog.findUnique({
    where: { id: mailLogId },
    select: { recipientCount: true, deliveredCount: true, failedCount: true, status: true },
  });
  if (!log) return;
  if (log.status !== "queued") return; // already finalized
  const total = log.deliveredCount + log.failedCount;
  if (total < log.recipientCount) return;
  let next;
  if (log.failedCount === 0) next = "sent";
  else if (log.deliveredCount === 0) next = "failed";
  else next = "partial";
  // updateMany with compound where so concurrent finalize calls only
  // hit the still-queued row exactly once. update() requires a unique
  // where, which would race.
  await prisma.mailLog.updateMany({
    where: { id: mailLogId, status: "queued" },
    data: { status: next },
  });
}
