// OpenTelemetry bootstrap. Only initialises when an OTLP endpoint
// is configured; otherwise this is a no-op and the structured logger
// (src/lib/log.ts) is the only signal.
//
// Backends supported out of the box (set OTEL_EXPORTER_OTLP_ENDPOINT
// + headers to point them at one):
//   - Grafana Cloud (https://grafana.com/docs/grafana-cloud/send-data/otlp/)
//   - Honeycomb (https://docs.honeycomb.io/getting-data-in/opentelemetry/)
//   - Cloud Trace via OTLP
//   - Self-hosted Jaeger / Tempo / OTel Collector
//
// The OTel SDK packages are loaded dynamically so deployments that
// don't use tracing don't pay for the deps. Add them via:
//   npm i @opentelemetry/api @opentelemetry/sdk-node \
//         @opentelemetry/auto-instrumentations-node \
//         @opentelemetry/exporter-trace-otlp-http
//
// Then set:
//   OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example.com/v1/traces
//   OTEL_SERVICE_NAME=compass
//   OTEL_EXPORTER_OTLP_HEADERS=authorization=Basic+ABC...

import { logger } from "@/lib/log";

const log = logger.child("otel");

let started = false;

export async function startOtel(): Promise<void> {
  if (started) return;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    log.debug("OTEL_EXPORTER_OTLP_ENDPOINT not set; skipping OTel boot");
    return;
  }
  try {
    // Dynamic imports keep these as optional deps. Module names are
    // string literals to bypass TS module resolution at compile time.
    const sdkSpec = "@opentelemetry/sdk-node";
    const autoSpec = "@opentelemetry/auto-instrumentations-node";
    const otlpSpec = "@opentelemetry/exporter-trace-otlp-http";
    const [sdkModule, autoModule, otlpModule] = await Promise.all([
      import(/* @vite-ignore */ sdkSpec),
      import(/* @vite-ignore */ autoSpec),
      import(/* @vite-ignore */ otlpSpec),
    ]);
    const { NodeSDK } = sdkModule as { NodeSDK: new (cfg: unknown) => { start: () => void } };
    const { getNodeAutoInstrumentations } = autoModule as {
      getNodeAutoInstrumentations: () => unknown;
    };
    const { OTLPTraceExporter } = otlpModule as {
      OTLPTraceExporter: new () => unknown;
    };

    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter(),
      instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
    started = true;
    log.info("otel started", {
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      service: process.env.OTEL_SERVICE_NAME ?? "compass",
    });
  } catch (err) {
    log.warn("otel SDK packages not installed; skipping", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
