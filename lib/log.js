// Structured logger.
//
// One-line JSON in production (machine-parseable for log aggregators);
// human-readable in dev (`[NS] msg key=value`). No third-party deps so
// the surface stays small.
//
// Levels: debug < info < warn < error. The minimum level honored is
// LOG_LEVEL (default "info" in production, "debug" in dev). Each module
// gets its own namespaced child via log.child("sms").
//
// Request scope is attached via log.with({ orgSlug, userId, requestId })
// — values flow through as JSON fields in the emitted line.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function defaultMinLevel() {
  const fromEnv = (process.env.LOG_LEVEL || "").toLowerCase();
  if (LEVELS[fromEnv] != null) return LEVELS[fromEnv];
  return process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;
}

function jsonSafe(v) {
  if (v instanceof Error) return { message: v.message, stack: v.stack, name: v.name };
  return v;
}

function formatPretty(level, ns, msg, fields) {
  const head = `[${level}${ns ? `/${ns}` : ""}] ${msg}`;
  const entries = Object.entries(fields || {}).filter(([, v]) => v !== undefined);
  if (!entries.length) return head;
  const tail = entries
    .map(([k, v]) => {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}=${s}`;
    })
    .join(" ");
  return `${head} ${tail}`;
}

function makeLogger({ ns = "", base = {}, minLevel, json } = {}) {
  const min = minLevel ?? defaultMinLevel();
  const useJson = json ?? process.env.NODE_ENV === "production";

  function emit(level, msg, fields) {
    if (LEVELS[level] < min) return;
    const merged = { ...base, ...fields };
    const safe = Object.fromEntries(
      Object.entries(merged).map(([k, v]) => [k, jsonSafe(v)]),
    );
    const line = useJson
      ? JSON.stringify({
          ts: new Date().toISOString(),
          level,
          ns: ns || undefined,
          msg,
          ...safe,
        })
      : formatPretty(level, ns, msg, safe);
    const stream = level === "error" || level === "warn" ? "stderr" : "stdout";
    process[stream].write(line + "\n");
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),

    /** Per-module child: `const log = logger.child("sms")`. */
    child(childNs) {
      const next = ns ? `${ns}/${childNs}` : childNs;
      return makeLogger({ ns: next, base, minLevel: min, json: useJson });
    },

    /** Per-request context: `req.log = logger.with({ requestId })`. */
    with(extra) {
      return makeLogger({ ns, base: { ...base, ...extra }, minLevel: min, json: useJson });
    },
  };
}

export const logger = makeLogger();

// Test/dev escape hatch: build a logger with explicit settings (used by
// tests to capture lines without polluting real stdout/stderr).
export function _internalMakeLogger(opts) {
  return makeLogger(opts);
}
