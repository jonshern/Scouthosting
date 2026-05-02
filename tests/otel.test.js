// Unit tests for lib/otel.js — opt-in OpenTelemetry bootstrap.
//
// We can't actually load the OTel SDK in CI (it's an optionalDependency
// not installed by default), so the tests assert the no-op behaviour
// when env is unset, and graceful failure when env IS set but the
// dependencies aren't there.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { startOtel, otelStatus } from "../lib/otel.js";

const SAVED = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

beforeEach(() => {
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
});

afterEach(() => {
  if (SAVED == null) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = SAVED;
});

describe("startOtel()", () => {
  it("returns false when OTEL_EXPORTER_OTLP_ENDPOINT is unset (default no-op)", async () => {
    const r = await startOtel();
    expect(r).toBe(false);
  });

  it("returns false (warns once) when env is set but optional deps aren't installed", async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318";
    // We don't have @opentelemetry/* installed in this repo's deps,
    // so the dynamic import inside startOtel() fails and the function
    // logs a warning and returns false. The contract: it never throws.
    const r = await startOtel();
    expect(r).toBe(false);
  });

  it("otelStatus reflects whether the SDK is running and the configured endpoint", async () => {
    const before = otelStatus();
    expect(before.enabled).toBe(false);
    expect(before.endpoint).toBe(null);

    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318";
    const after = otelStatus();
    // enabled stays false (deps missing), but endpoint is reported
    // back so /__super health checks see what would be exported.
    expect(after.enabled).toBe(false);
    expect(after.endpoint).toBe("http://localhost:4318");
  });
});
