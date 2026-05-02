// OpenTelemetry server-side tracing — opt-in.
//
// Activates ONLY when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (e.g.
// https://api.honeycomb.io for Honeycomb, http://localhost:4318 for a
// local Tempo / OTel collector). With env unset, this module is a
// no-op so unconfigured environments (dev, tests, contributors who
// haven't installed the optional deps) don't pay any cost.
//
// Auto-instrumentation gives us spans for free on:
//   - express handlers + middleware
//   - prisma queries (with @prisma/instrumentation)
//   - http(s) outbound (Postmark, Resend, OAuth callbacks)
//   - dns / net
//
// The user-facing "what's slow / what errors" question is answered by
// the OTLP backend (Honeycomb / Datadog / Grafana Tempo). This module
// just emits the data; we don't ship a UI.

import { logger } from "./log.js";

const log = logger.child("otel");

let _started = false;

/**
 * Bootstrap the SDK if (a) the operator opted in via env and (b) the
 * optional OTel packages are installed. Idempotent.
 *
 * Should be called once, very early in server/index.js — BEFORE any
 * other express/prisma imports run, so auto-instrumentation can patch
 * those modules as they load.
 */
export async function startOtel() {
  if (_started) return false;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return false;

  try {
    // Lazy-imported so unconfigured envs never load the SDK. The
    // packages are listed under optionalDependencies so a fresh
    // checkout that runs `npm install --omit=optional` (or where
    // these fail to build) still boots cleanly.
    const [
      { NodeSDK },
      { getNodeAutoInstrumentations },
      { OTLPTraceExporter },
      { Resource },
      { SemanticResourceAttributes },
    ] = await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/auto-instrumentations-node"),
      import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/resources"),
      import("@opentelemetry/semantic-conventions"),
    ]);

    const serviceName = process.env.OTEL_SERVICE_NAME || "compass-server";
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.GIT_SHA || "dev",
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || "development",
    });

    const sdk = new NodeSDK({
      resource,
      traceExporter: new OTLPTraceExporter({
        // OTLP/HTTP path is conventionally /v1/traces but most vendors
        // accept either; the exporter reads the env directly when the
        // arg is undefined, which is what we want.
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Keep fs noise out of traces — we don't want a span per
          // template read.
          "@opentelemetry/instrumentation-fs": { enabled: false },
        }),
      ],
    });

    sdk.start();
    _started = true;
    log.info("otel started", { endpoint, serviceName });

    // Flush pending spans before the process exits.
    process.on("SIGTERM", () => {
      sdk.shutdown().catch((e) => log.warn("otel shutdown failed", { err: e }));
    });
    return true;
  } catch (err) {
    // Optional dep missing or vendor unreachable — log once and run
    // without tracing.
    log.warn("otel disabled (optional dep missing or init failed)", {
      err: err && err.message,
    });
    return false;
  }
}

/**
 * Status helper for /__super health checks.
 */
export function otelStatus() {
  return {
    enabled: _started,
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || null,
  };
}
