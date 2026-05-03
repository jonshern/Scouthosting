// Pin the structured-error-event shape. The Cloud Error Reporting
// `@type` is a magic string the aggregator looks for to auto-extract
// errors from log lines — getting it wrong is a silent regression
// (errors still log, but Error Reporting won't group them).

import { describe, it, expect } from "vitest";
import { formatErrorEvent, fingerprintError } from "../lib/errorTracker.js";

function fakeReq(overrides = {}) {
  return {
    method: "POST",
    path: "/admin/members/abc/edit",
    query: {},
    body: { firstName: "Alice", lastName: "Pemberton" },
    headers: { "user-agent": "vitest", "x-request-id": "rq-1" },
    ip: "192.0.2.1",
    org: { slug: "pack100" },
    user: { id: "u-cubmaster" },
    log: { base: { requestId: "rq-1" } },
    ...overrides,
  };
}

describe("formatErrorEvent", () => {
  it("emits Cloud Error Reporting @type so the aggregator can group", () => {
    const event = formatErrorEvent(new Error("boom"), fakeReq());
    expect(event["@type"]).toBe(
      "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
    );
    expect(event.severity).toBe("ERROR");
    expect(event.serviceContext.service).toBe("compass");
  });

  it("captures stack + name + message", () => {
    const err = new TypeError("nope");
    const event = formatErrorEvent(err, fakeReq());
    expect(event.error.message).toBe("nope");
    expect(event.error.name).toBe("TypeError");
    expect(typeof event.error.stack).toBe("string");
    expect(event.error.stack).toContain("TypeError: nope");
  });

  it("attaches request context: method, path, orgSlug, userId, requestId", () => {
    const event = formatErrorEvent(new Error("x"), fakeReq());
    expect(event.request.method).toBe("POST");
    expect(event.request.path).toBe("/admin/members/abc/edit");
    expect(event.request.orgSlug).toBe("pack100");
    expect(event.request.userId).toBe("u-cubmaster");
    expect(event.request.requestId).toBe("rq-1");
  });

  it("scrubs Authorization, Cookie, and Set-Cookie headers", () => {
    const req = fakeReq({
      headers: {
        "user-agent": "vitest",
        Authorization: "Bearer secret-token",
        Cookie: "session=abc",
        "Set-Cookie": "session=def",
        "X-API-Key": "leak",
      },
    });
    const event = formatErrorEvent(new Error("x"), req);
    expect(event.request.headers.Authorization).toBe("[scrubbed]");
    expect(event.request.headers.Cookie).toBe("[scrubbed]");
    expect(event.request.headers["Set-Cookie"]).toBe("[scrubbed]");
    expect(event.request.headers["X-API-Key"]).toBe("[scrubbed]");
    expect(event.request.headers["user-agent"]).toBe("vitest");
  });

  it("scrubs the entire body on auth-shaped routes", () => {
    for (const path of ["/login", "/signup", "/forgot", "/reset/abc", "/auth/google/start", "/admin/login"]) {
      const event = formatErrorEvent(new Error("x"), fakeReq({ path, body: { email: "a@b.com", password: "secret" } }));
      expect(event.request.body).toBe("[scrubbed: auth route]");
    }
  });

  it("scrubs sensitive keys inside otherwise-safe bodies", () => {
    const req = fakeReq({
      body: {
        firstName: "Atlas",
        password: "should-not-appear",
        currentPassword: "also-not",
        token: "csrf-secret",
        prospectNote: "Bear-age son",
      },
    });
    const event = formatErrorEvent(new Error("x"), req);
    expect(event.request.body.firstName).toBe("Atlas");
    expect(event.request.body.password).toBe("[scrubbed]");
    expect(event.request.body.currentPassword).toBe("[scrubbed]");
    expect(event.request.body.token).toBe("[scrubbed]");
    expect(event.request.body.prospectNote).toBe("Bear-age son");
  });

  it("works without a request (process-level fatal handlers pass req=null)", () => {
    const event = formatErrorEvent(new Error("crash"), null);
    expect(event.error.message).toBe("crash");
    expect(event.request).toBeUndefined();
  });

  it("coerces non-Error values into Error so .stack is present", () => {
    const event = formatErrorEvent("string thrown by old code", fakeReq());
    expect(event.error.message).toBe("string thrown by old code");
    expect(typeof event.error.stack).toBe("string");
  });

  it("release falls back to 'dev' when GIT_SHA isn't set", () => {
    const prev = process.env.GIT_SHA;
    delete process.env.GIT_SHA;
    delete process.env.SOURCE_VERSION;
    try {
      const event = formatErrorEvent(new Error("x"), fakeReq());
      expect(event.release).toBe("dev");
      expect(event.serviceContext.version).toBe("dev");
    } finally {
      if (prev != null) process.env.GIT_SHA = prev;
    }
  });

  it("uses GIT_SHA when present", () => {
    const prev = process.env.GIT_SHA;
    process.env.GIT_SHA = "abc1234";
    try {
      const event = formatErrorEvent(new Error("x"), fakeReq());
      expect(event.release).toBe("abc1234");
    } finally {
      if (prev != null) process.env.GIT_SHA = prev;
      else delete process.env.GIT_SHA;
    }
  });
});

describe("fingerprintError", () => {
  // The same exception thrown from the same line should produce the
  // same fingerprint — that's how /__super/errors groups occurrences.
  function thrower() {
    throw new Error("boom");
  }

  it("is stable across throws from the same site", () => {
    let a, b;
    try { thrower(); } catch (e) { a = fingerprintError(e); }
    try { thrower(); } catch (e) { b = fingerprintError(e); }
    expect(a).toBe(b);
  });

  it("differs when the error class differs", () => {
    expect(fingerprintError(new Error("x"))).not.toBe(fingerprintError(new TypeError("x")));
  });

  it("returns a 40-char sha1 hex", () => {
    expect(fingerprintError(new Error("hi"))).toMatch(/^[0-9a-f]{40}$/);
  });

  it("handles non-Error throws by coercing to Error", () => {
    expect(typeof fingerprintError("string thrown")).toBe("string");
    expect(fingerprintError("string thrown")).toMatch(/^[0-9a-f]{40}$/);
  });

  it("falls back to message when no stack frame is parseable", () => {
    const err = new Error("no frames");
    err.stack = "Error: no frames"; // single line, no "at " frames
    const fp = fingerprintError(err);
    expect(fp).toMatch(/^[0-9a-f]{40}$/);
  });
});
