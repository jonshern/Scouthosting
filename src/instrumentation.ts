// Next.js instrumentation hook — boots once per server process.
// Runs:
//   - process-level fatal-error handlers (uncaughtException +
//     unhandledRejection logging via lib/ops/error-tracker)
//   - the pg-boss jobs runtime (which is a no-op in test / when
//     JOBS_DISABLED=1)
//
// OpenTelemetry boot would slot in here when a tracing backend is
// configured (OTEL_EXPORTER_OTLP_ENDPOINT). Held back from this port
// because the SDK init is non-trivial and the current deployments
// run without a tracing backend; lib/log already emits structured
// events that the existing log-aggregation backends pick up.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { installFatalHandlers } = await import("@/lib/ops/error-tracker");
  installFatalHandlers({ service: "compass-next" });

  // Start jobs runtime in production only — tests & dev rely on
  // in-process mode so a single test run doesn't spin up a worker.
  if (process.env.NODE_ENV === "production" && process.env.JOBS_DISABLED !== "1") {
    const { startJobsRuntime } = await import("@/lib/jobs");
    await startJobsRuntime().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("startJobsRuntime failed", err);
    });
  }
}
