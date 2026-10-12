// Next.js instrumentation hook — boots once per server process.
// Runs:
//   - OpenTelemetry SDK (no-op when OTEL_EXPORTER_OTLP_ENDPOINT
//     isn't set; lazy-loads the SDK packages so they're optional)
//   - in production, a config check of the required env (APEX_HOST, a
//     32+ char auth secret, MASTER_KEY): when one is missing every
//     request fails, /health included, so a blue-green deploy never
//     flips traffic to it (otherwise /health passed and only some
//     pages broke)
//   - process-level fatal-error handlers (lib/ops/error-tracker)
//   - the pg-boss jobs runtime (no-op in tests / when JOBS_DISABLED=1)
//   - on a demo deployment (DEMO_MODE=1), the demo reset check: seed an
//     empty database at boot, then reset once a day (src/lib/demo)

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // OTel must boot before anything else so auto-instrumentation can
  // wrap the modules imported afterwards.
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const { startOtel } = await import("@/lib/ops/otel");
    await startOtel();
  }

  if (process.env.NODE_ENV === "production") {
    // Both throw with a message naming the missing variable.
    await import("@/lib/env");
    const { getMasterKey } = await import("@/lib/encryption");
    getMasterKey();
  }

  const { installFatalHandlers } = await import("@/lib/ops/error-tracker");
  installFatalHandlers({ service: "compass" });

  if (process.env.NODE_ENV === "production" && process.env.JOBS_DISABLED !== "1") {
    const { startJobsRuntime } = await import("@/lib/jobs");
    await startJobsRuntime().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("startJobsRuntime failed", err);
    });
  }

  if (process.env.DEMO_MODE === "1") {
    const { maybeResetDemo } = await import("@/lib/demo/reset");
    const check = () =>
      maybeResetDemo().catch((err) => {
        console.error("demo reset failed", err);
      });
    void check();
    // Hourly while the process is up (the Mac, or an always-on
    // instance). On Cloud Run the scheduler's /api/cron/run tick does
    // the same check.
    setInterval(check, 60 * 60 * 1000).unref();
  }
}

// Errors thrown while rendering a page, running a server action or a
// route handler (Next calls this for each). They go to the log and the
// super-admin error log; the visitor sees app/error.tsx.
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routePath?: string; routeType?: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureError } = await import("@/lib/ops/error-tracker");
  await captureError(err, {
    method: request.method,
    path: context.routePath ? `${request.path} (${context.routeType} ${context.routePath})` : request.path,
    headers: request.headers,
  }).catch(() => {});
}
