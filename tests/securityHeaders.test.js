import { describe, it, expect } from "vitest";
import { securityHeaders } from "../lib/securityHeaders.js";

function fakeCtx(env = {}) {
  const headers = {};
  const res = {
    setHeader: (k, v) => {
      headers[k] = String(v);
    },
  };
  return { res, headers };
}

describe("securityHeaders", () => {
  it("sets CSP and the no-brainer hardening headers", () => {
    const { res, headers } = fakeCtx();
    securityHeaders({}, res, () => {});

    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });

  it("only emits HSTS in production", () => {
    const wasProd = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { res, headers } = fakeCtx();
      securityHeaders({}, res, () => {});
      expect(headers["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    } finally {
      process.env.NODE_ENV = wasProd;
    }

    delete process.env.NODE_ENV;
    const { res, headers } = fakeCtx();
    securityHeaders({}, res, () => {});
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });

  it("calls next()", () => {
    const { res } = fakeCtx();
    let called = false;
    securityHeaders({}, res, () => {
      called = true;
    });
    expect(called).toBe(true);
  });
});
