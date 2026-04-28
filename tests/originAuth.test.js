import { describe, it, expect, beforeEach, vi } from "vitest";

async function loadMiddleware() {
  vi.resetModules();
  return (await import("../lib/originAuth.js")).originAuth;
}

function fakeReq(headers = {}) {
  return { headers };
}
function fakeRes() {
  const res = { statusCode: 200, body: "" };
  res.status = (c) => { res.statusCode = c; return res; };
  res.type = () => res;
  res.send = (b) => { res.body = b; return res; };
  return res;
}

describe("originAuth middleware", () => {
  beforeEach(() => {
    delete process.env.ORIGIN_AUTH_SECRET;
  });

  it("no-ops when ORIGIN_AUTH_SECRET is unset (dev mode)", async () => {
    const mw = await loadMiddleware();
    const next = vi.fn();
    mw(fakeReq({}), fakeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("403s when the secret is set but the header is missing", async () => {
    process.env.ORIGIN_AUTH_SECRET = "shared-secret-1234567890ab";
    const mw = await loadMiddleware();
    const next = vi.fn();
    const res = fakeRes();
    mw(fakeReq({}), res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("403s when the header doesn't match", async () => {
    process.env.ORIGIN_AUTH_SECRET = "shared-secret-1234567890ab";
    const mw = await loadMiddleware();
    const next = vi.fn();
    const res = fakeRes();
    mw(fakeReq({ "x-origin-auth": "wrong-value-with-same-length" }), res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when the header matches exactly", async () => {
    process.env.ORIGIN_AUTH_SECRET = "shared-secret-1234567890ab";
    const mw = await loadMiddleware();
    const next = vi.fn();
    const res = fakeRes();
    mw(fakeReq({ "x-origin-auth": "shared-secret-1234567890ab" }), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("rejects header lengths that don't match (avoids leaking length via timing)", async () => {
    process.env.ORIGIN_AUTH_SECRET = "shared-secret-1234567890ab";
    const mw = await loadMiddleware();
    const next = vi.fn();
    const res = fakeRes();
    mw(fakeReq({ "x-origin-auth": "short" }), res, next);
    expect(res.statusCode).toBe(403);
  });
});
