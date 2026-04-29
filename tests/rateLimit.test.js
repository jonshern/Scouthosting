import { describe, it, expect, beforeEach } from "vitest";
import { take, _resetBuckets, rateLimit } from "../lib/rateLimit.js";

describe("rate limit · take()", () => {
  beforeEach(() => {
    _resetBuckets();
    delete process.env.DISABLE_RATE_LIMIT;
  });

  it("allows up to limit requests in the window", () => {
    const cfg = { name: "x", ip: "1.1.1.1", limit: 3, windowMs: 1000, now: 0 };
    expect(take(cfg)).toMatchObject({ ok: true, remaining: 2 });
    expect(take(cfg)).toMatchObject({ ok: true, remaining: 1 });
    expect(take(cfg)).toMatchObject({ ok: true, remaining: 0 });
    expect(take(cfg)).toMatchObject({ ok: false });
  });

  it("resets after the window passes", () => {
    const base = { name: "x", ip: "1.1.1.1", limit: 1, windowMs: 1000 };
    expect(take({ ...base, now: 0 })).toMatchObject({ ok: true });
    expect(take({ ...base, now: 100 })).toMatchObject({ ok: false });
    expect(take({ ...base, now: 1500 })).toMatchObject({ ok: true });
  });

  it("scopes per (name, ip) — different IPs each get their own bucket", () => {
    const a = take({ name: "x", ip: "1.1.1.1", limit: 1, windowMs: 1000, now: 0 });
    const b = take({ name: "x", ip: "2.2.2.2", limit: 1, windowMs: 1000, now: 0 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("retryAfter is in whole seconds, rounded up", () => {
    const cfg = { name: "x", ip: "1.1.1.1", limit: 1, windowMs: 30_000 };
    take({ ...cfg, now: 0 });
    const r = take({ ...cfg, now: 1500 });
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBe(29);
  });
});

describe("rate limit · middleware", () => {
  beforeEach(() => {
    _resetBuckets();
    delete process.env.DISABLE_RATE_LIMIT;
  });

  function fakeReqRes(ip = "9.9.9.9") {
    const headers = {};
    let status = 200;
    let body = null;
    const res = {
      setHeader: (k, v) => {
        headers[k] = String(v);
      },
      status: (c) => {
        status = c;
        return res;
      },
      type: () => res,
      send: (b) => {
        body = b;
      },
    };
    const req = { ip };
    return { req, res, getStatus: () => status, getBody: () => body, headers };
  }

  it("calls next() until the bucket fills, then 429s", () => {
    const mw = rateLimit({ name: "test", limit: 2, windowMs: 60_000 });
    const calls = [];
    const next = () => calls.push("next");
    const a = fakeReqRes();
    mw(a.req, a.res, next);
    mw(a.req, a.res, next);
    mw(a.req, a.res, next);
    expect(calls).toHaveLength(2);
    expect(a.getStatus()).toBe(429);
    expect(a.headers["Retry-After"]).toMatch(/^\d+$/);
  });

  it("DISABLE_RATE_LIMIT=1 bypasses the limiter", () => {
    process.env.DISABLE_RATE_LIMIT = "1";
    const mw = rateLimit({ name: "test", limit: 1, windowMs: 60_000 });
    const calls = [];
    const next = () => calls.push("next");
    const ctx = fakeReqRes();
    for (let i = 0; i < 5; i++) mw(ctx.req, ctx.res, next);
    expect(calls).toHaveLength(5);
    expect(ctx.getStatus()).toBe(200);
  });
});
