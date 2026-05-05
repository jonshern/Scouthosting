// Next.js instrumentation hook — boots once per server process.
// Runs:
//   - OpenTelemetry SDK (no-op when OTEL_EXPORTER_OTLP_ENDPOINT
//     isn't set; lazy-loads the SDK packages so they're optional)
//   - process-level fatal-error handlers (lib/ops/error-tracker)
//   - the pg-boss jobs runtime (no-op in tests / when JOBS_DISABLED=1)

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // OTel must boot before anything else so auto-instrumentation can
  // wrap the modules imported afterwards.
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const { startOtel } = await import("@/lib/ops/otel");
    await startOtel();
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
}
