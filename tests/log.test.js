// Logger contract tests. We can't easily intercept process.stdout/stderr
// without monkey-patching, so we build a logger that writes to a buffer
// and assert on the captured lines.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { logger, _internalMakeLogger } from "../lib/log.js";

function captureStreams() {
  const stdout = [];
  const stderr = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => {
    stdout.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr.push(String(chunk));
    return true;
  };
  return {
    stdout,
    stderr,
    restore: () => {
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
    },
  };
}

describe("logger", () => {
  let cap;
  beforeEach(() => { cap = captureStreams(); });
  afterEach(() => cap.restore());

  it("emits JSON in production mode", () => {
    const log = _internalMakeLogger({ ns: "test", json: true, minLevel: 10 });
    log.info("hello", { user: "alice" });
    const line = cap.stdout.join("");
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.ns).toBe("test");
    expect(parsed.msg).toBe("hello");
    expect(parsed.user).toBe("alice");
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("emits pretty lines in dev mode", () => {
    const log = _internalMakeLogger({ ns: "sms", json: false, minLevel: 10 });
    log.info("dispatched", { id: "msg_42" });
    expect(cap.stdout.join("")).toMatch(/\[info\/sms\] dispatched id=msg_42/);
  });

  it("warn + error go to stderr; info + debug go to stdout", () => {
    const log = _internalMakeLogger({ json: true, minLevel: 10 });
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(cap.stdout.join("")).toMatch(/"msg":"d"/);
    expect(cap.stdout.join("")).toMatch(/"msg":"i"/);
    expect(cap.stderr.join("")).toMatch(/"msg":"w"/);
    expect(cap.stderr.join("")).toMatch(/"msg":"e"/);
  });

  it("filters below minLevel", () => {
    const log = _internalMakeLogger({ json: true, minLevel: 30 }); // warn+
    log.debug("d");
    log.info("i");
    log.warn("w");
    expect(cap.stdout.join("")).not.toMatch(/"msg":"d"/);
    expect(cap.stdout.join("")).not.toMatch(/"msg":"i"/);
    expect(cap.stderr.join("")).toMatch(/"msg":"w"/);
  });

  it("child() namespaces nest", () => {
    const log = _internalMakeLogger({ ns: "http", json: true, minLevel: 10 });
    log.child("admin").info("hit", { path: "/admin" });
    const parsed = JSON.parse(cap.stdout.join(""));
    expect(parsed.ns).toBe("http/admin");
    expect(parsed.path).toBe("/admin");
  });

  it("with() attaches context that flows through to all subsequent lines", () => {
    const log = _internalMakeLogger({ ns: "req", json: true, minLevel: 10 });
    const scoped = log.with({ requestId: "r1", orgSlug: "troop12" });
    scoped.info("first");
    scoped.warn("second");
    const lines = (cap.stdout.join("") + cap.stderr.join("")).trim().split("\n");
    for (const l of lines) {
      const p = JSON.parse(l);
      expect(p.requestId).toBe("r1");
      expect(p.orgSlug).toBe("troop12");
    }
  });

  it("serialises Error instances safely (preserves message + stack)", () => {
    const log = _internalMakeLogger({ json: true, minLevel: 10 });
    const err = new Error("boom");
    log.error("op failed", { err });
    const parsed = JSON.parse(cap.stderr.join(""));
    expect(parsed.err.message).toBe("boom");
    expect(parsed.err.stack).toContain("Error: boom");
  });

  it("the singleton `logger` export is a working logger", () => {
    // Smoke — just confirm it doesn't throw.
    expect(() => logger.info("ping")).not.toThrow();
  });
});
