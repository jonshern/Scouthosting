// Background job queue contract.
//
// Pins:
//   - In-process mode (no DATABASE_URL / NODE_ENV=test): enqueueJob runs
//     handlers synchronously
//   - Unknown job name: discarded, returns mode:"discarded", no throw
//   - registerHandler is idempotent (last write wins)
//   - email.send handler resolves to a sendMail call when the mock
//     mail driver succeeds; throws when it fails (so the queue retries)
//
// The queued path (real pg-boss + Postgres) isn't exercised here — it
// requires a live DB and pg-boss schema, which integration tests cover
// when present. The contract this file pins is the part of the API
// that callers depend on.

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  enqueueJob,
  registerHandler,
  jobsStatus,
  _resetForTests,
} from "../lib/jobs.js";

describe("jobs queue (in-process mode)", () => {
  beforeEach(() => {
    _resetForTests();
  });

  it("registerHandler + enqueueJob runs the handler synchronously", async () => {
    const calls = [];
    registerHandler("test.work", async (data) => {
      calls.push(data);
    });
    const r = await enqueueJob("test.work", { x: 42 });
    expect(r.mode).toBe("in-process");
    expect(r.id).toBeNull();
    expect(calls).toEqual([{ x: 42 }]);
  });

  it("propagates handler exceptions to the caller", async () => {
    registerHandler("test.boom", async () => {
      throw new Error("nope");
    });
    await expect(enqueueJob("test.boom", {})).rejects.toThrow("nope");
  });

  it("returns mode:'discarded' (no throw) when no handler is registered", async () => {
    const r = await enqueueJob("test.unregistered", {});
    expect(r.mode).toBe("discarded");
    expect(r.id).toBeNull();
  });

  it("registerHandler is idempotent — last write wins", async () => {
    let calledV1 = 0;
    let calledV2 = 0;
    registerHandler("test.swap", async () => { calledV1++; });
    registerHandler("test.swap", async () => { calledV2++; });
    await enqueueJob("test.swap", {});
    expect(calledV1).toBe(0);
    expect(calledV2).toBe(1);
  });

  it("handler receives a logger in the context", async () => {
    let ctxSeen = null;
    registerHandler("test.ctx", async (_data, ctx) => { ctxSeen = ctx; });
    await enqueueJob("test.ctx", {});
    expect(ctxSeen).toBeTruthy();
    expect(typeof ctxSeen.logger).toBe("object");
  });

  it("jobsStatus reports running:false in-process and lists registered names", async () => {
    registerHandler("test.a", async () => {});
    registerHandler("test.b", async () => {});
    const s = jobsStatus();
    expect(s.running).toBe(false);
    expect(s.handlers.sort()).toEqual(["test.a", "test.b"]);
  });
});

describe("email.send built-in handler", () => {
  // The handler dynamic-imports lib/mail.js at call time, so vi.doMock
  // inside the test takes effect without needing to re-import jobs.js.
  beforeEach(() => {
    vi.resetModules();
    _resetForTests();
  });

  it("invokes lib/mail.js#send with the job payload", async () => {
    const sendCalls = [];
    vi.doMock("../lib/mail.js", () => ({
      send: async (msg) => {
        sendCalls.push(msg);
        return { ok: true, id: "msg-1" };
      },
    }));
    // Re-import jobs.js fresh so its module-level `registerHandler`
    // for email.send re-runs against this test's registry.
    const mod = await import("../lib/jobs.js");
    await mod.enqueueJob("email.send", {
      to: "user@example.com",
      subject: "Hello",
      text: "Body",
    });
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].to).toBe("user@example.com");
  });

  it("throws (so pg-boss retries) when the mail driver returns ok:false", async () => {
    vi.doMock("../lib/mail.js", () => ({
      send: async () => ({ ok: false, error: "smtp_down" }),
    }));
    const mod = await import("../lib/jobs.js");
    await expect(
      mod.enqueueJob("email.send", { to: "u@e.com", subject: "x", text: "y" }),
    ).rejects.toThrow(/smtp_down/);
  });
});
