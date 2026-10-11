import { afterEach, describe, expect, it } from "vitest";
import { clientIp, clientIpConfig, clientIpFromHeaders, clientIpHeaders } from "./client-ip";

const h = (o: Record<string, string>) => new Headers(o);

describe("clientIpConfig", () => {
  it("trusts nothing in production outside a known platform", () => {
    expect(clientIpConfig({ NODE_ENV: "production" }).header).toBeNull();
    expect(clientIpHeaders({ header: null, xffHops: 1 })).toEqual([]);
  });
  it("uses the rightmost X-Forwarded-For hop in dev", () => {
    expect(clientIpConfig({ NODE_ENV: "development" }).header).toBe("x-forwarded-for");
  });
  it("accepts TRUSTED_IP_HEADER / TRUSTED_PROXY_HOPS as aliases", () => {
    expect(clientIpConfig({ TRUSTED_IP_HEADER: "X-Real-IP", TRUSTED_PROXY_HOPS: "2" })).toEqual({
      header: "x-real-ip",
      xffHops: 2,
    });
  });
  it("uses the rightmost X-Forwarded-For hop on Cloud Run", () => {
    expect(clientIpConfig({ K_SERVICE: "api" })).toEqual({ header: "x-forwarded-for", xffHops: 1 });
  });
  it("lets an explicit header win", () => {
    expect(clientIpConfig({ K_SERVICE: "x", CLIENT_IP_HEADER: "CF-Connecting-IP" }).header).toBe(
      "cf-connecting-ip",
    );
  });
});

describe("clientIp", () => {
  it("returns null when no header is trusted, whatever the client sends", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4" }), { header: null, xffHops: 1 })).toBeNull();
  });

  it("ignores client-supplied X-Forwarded-For entries to the left", () => {
    const cfg = { header: "x-forwarded-for", xffHops: 1 };
    const a = clientIp(h({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }), cfg);
    const b = clientIp(h({ "x-forwarded-for": "8.8.8.8, 7.7.7.7, 203.0.113.7" }), cfg);
    expect(a).toBe("203.0.113.7");
    expect(b).toBe("203.0.113.7");
  });

  it("counts hops from the right behind a load balancer", () => {
    const cfg = { header: "x-forwarded-for", xffHops: 2 };
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 35.191.0.1" }), cfg)).toBe(
      "203.0.113.7",
    );
    expect(clientIp(h({ "x-forwarded-for": "35.191.0.1" }), cfg)).toBeNull();
  });

  it("reads a single-value platform header and ignores X-Forwarded-For", () => {
    const cfg = { header: "cf-connecting-ip", xffHops: 1 };
    expect(clientIp(h({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1" }), cfg)).toBe(
      "203.0.113.9",
    );
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1" }), cfg)).toBeNull();
  });

  it("normalises ports and IPv6, and rejects junk", () => {
    const cfg = { header: "x-real-ip", xffHops: 1 };
    expect(clientIp(h({ "x-real-ip": "203.0.113.7:5123" }), cfg)).toBe("203.0.113.7");
    expect(clientIp(h({ "x-real-ip": "[2001:DB8::1]:443" }), cfg)).toBe("2001:db8::1");
    expect(clientIp(h({ "x-real-ip": "2001:db8::2" }), cfg)).toBe("2001:db8::2");
    expect(clientIp(h({ "x-real-ip": "not-an-ip" }), cfg)).toBeNull();
    expect(clientIp(h({ "x-real-ip": "v1:user:abc" }), cfg)).toBeNull();
  });
});

describe("clientIpFromHeaders", () => {
  afterEach(() => {
    delete process.env.TRUSTED_IP_HEADER;
    delete process.env.TRUSTED_PROXY_HOPS;
  });

  it("ignores client-supplied entries at the front of X-Forwarded-For", () => {
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("walks back the configured number of proxy hops", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });

  it("uses a platform header verbatim when configured", () => {
    process.env.TRUSTED_IP_HEADER = "cf-connecting-ip";
    expect(
      clientIpFromHeaders(h({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "6.6.6.6" })),
    ).toBe("198.51.100.7");
  });

  it("falls back to anon", () => {
    expect(clientIpFromHeaders(h({}))).toBe("anon");
  });
});
