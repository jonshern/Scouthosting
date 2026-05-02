// OTel bootstrap. Run via Node's --import flag BEFORE any server
// modules load so auto-instrumentation can patch `express` and
// `@prisma/client` as they're imported by server/index.js.
//
//   node --import ./lib/otelBootstrap.js server/index.js
//
// No-ops when OTEL_EXPORTER_OTLP_ENDPOINT is unset. Safe to keep in
// the start script for every environment.

import { startOtel } from "./otel.js";

await startOtel();
