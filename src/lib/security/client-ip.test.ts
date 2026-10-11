import { describe, expect, it } from "vitest";
import { clientIp, clientIpConfig } from "./client-ip";

const h = (o: Record<string, string>) => new Headers(o);

describe("clientIpConfig", () => {
  it("trusts nothing outside a known platform", () => {
    expect(clientIpConfig({}).header).toBeNull();
  });
  it("uses Fly-Client-IP on Fly", () => {
    expect(clientIpConfig({ FLY_APP_NAME: "compass" }).header).toBe("fly-client-ip");
  });
  it("uses the rightmost X-Forwarded-For hop on Cloud Run", () => {
    expect(clientIpConfig({ K_SERVICE: "api" })).toEqual({ header: "x-forwarded-for", xffHops: 1 });
  });
  it("lets an explicit header win", () => {
    expect(clientIpConfig({ FLY_APP_NAME: "x", CLIENT_IP_HEADER: "CF-Connecting-IP" }).header).toBe(
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
    const cfg = { header: "fly-client-ip", xffHops: 1 };
    expect(clientIp(h({ "fly-client-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1" }), cfg)).toBe(
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
