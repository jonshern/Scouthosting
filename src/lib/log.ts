// Structured logger.
//
// One-line JSON in production; human-readable in dev (`[level/ns] msg
// key=value`). No third-party deps. Per-module child loggers via
// log.child("sms"); per-request context via log.with({ requestId }).

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

function defaultMinLevel(): number {
  const fromEnv = (process.env.LOG_LEVEL || "").toLowerCase() as Level;
  if (LEVELS[fromEnv] != null) return LEVELS[fromEnv];
  return process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;
}

function jsonSafe(v: unknown): unknown {
  if (v instanceof Error) return { message: v.message, stack: v.stack, name: v.name };
  return v;
}

function formatPretty(
  level: string,
  ns: string,
  msg: string,
  fields: Record<string, unknown>,
): string {
  const head = `[${level}${ns ? `/${ns}` : ""}] ${msg}`;
  const entries = Object.entries(fields || {}).filter(([, v]) => v !== undefined);
  if (!entries.length) return head;
  const tail = entries
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  return `${head} ${tail}`;
}

export type Logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => void;
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (msg: string, fields?: Record<string, unknown>) => void;
  child: (ns: string) => Logger;
  with: (extra: Record<string, unknown>) => Logger;
};

type Opts = {
  ns?: string;
  base?: Record<string, unknown>;
  minLevel?: number;
  json?: boolean;
};

function makeLogger({ ns = "", base = {}, minLevel, json }: Opts = {}): Logger {
  const min = minLevel ?? defaultMinLevel();
  const useJson = json ?? process.env.NODE_ENV === "production";

  function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
    if (LEVELS[level] < min) return;
    const merged = { ...base, ...(fields ?? {}) };
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
    child(childNs: string) {
      const next = ns ? `${ns}/${childNs}` : childNs;
      return makeLogger({ ns: next, base, minLevel: min, json: useJson });
    },
    with(extra: Record<string, unknown>) {
      return makeLogger({ ns, base: { ...base, ...extra }, minLevel: min, json: useJson });
    },
  };
}

export const logger: Logger = makeLogger();

export function _internalMakeLogger(opts: Opts): Logger {
  return makeLogger(opts);
}
