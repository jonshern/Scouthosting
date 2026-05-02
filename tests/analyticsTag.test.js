// Unit tests for the analytics tag helpers in lib/analyticsTag.js.
// No DB, no HTTP — pure string-shape assertions on the snippets.

import { describe, it, expect, beforeEach } from "vitest";
import { marketingTag, firstPartyTag, _resetForTests } from "../lib/analyticsTag.js";

beforeEach(() => {
  delete process.env.ANALYTICS_PROVIDER;
  delete process.env.PLAUSIBLE_DOMAIN;
  delete process.env.PLAUSIBLE_SCRIPT_URL;
  delete process.env.GA4_MEASUREMENT_ID;
  _resetForTests();
});

describe("marketingTag()", () => {
  it("returns empty string when no provider is configured (default privacy posture)", () => {
    expect(marketingTag()).toBe("");
  });

  it("returns Plausible script when ANALYTICS_PROVIDER=plausible + PLAUSIBLE_DOMAIN set", () => {
    process.env.ANALYTICS_PROVIDER = "plausible";
    process.env.PLAUSIBLE_DOMAIN = "compass.app";
    _resetForTests();
    const tag = marketingTag();
    expect(tag).toMatch(/<script[^>]+defer[^>]+data-domain="compass\.app"[^>]+src="https:\/\/plausible\.io\/js\/script\.js"/);
  });

  it("respects PLAUSIBLE_SCRIPT_URL override (self-hosted)", () => {
    process.env.ANALYTICS_PROVIDER = "plausible";
    process.env.PLAUSIBLE_DOMAIN = "compass.app";
    process.env.PLAUSIBLE_SCRIPT_URL = "https://stats.example.com/js/p.js";
    _resetForTests();
    const tag = marketingTag();
    expect(tag).toContain("https://stats.example.com/js/p.js");
  });

  it("returns nothing if provider is plausible but domain is missing", () => {
    process.env.ANALYTICS_PROVIDER = "plausible";
    _resetForTests();
    expect(marketingTag()).toBe("");
  });

  it("returns GA4 snippet (with anonymize_ip) when configured", () => {
    process.env.ANALYTICS_PROVIDER = "ga4";
    process.env.GA4_MEASUREMENT_ID = "G-ABCDE12345";
    _resetForTests();
    const tag = marketingTag();
    expect(tag).toContain("googletagmanager.com/gtag/js?id=G-ABCDE12345");
    expect(tag).toContain("anonymize_ip: true");
  });

  it("escapes attribute values so a stray quote in env can't inject markup", () => {
    process.env.ANALYTICS_PROVIDER = "plausible";
    process.env.PLAUSIBLE_DOMAIN = `evil"><script>alert(1)</script>`;
    _resetForTests();
    const tag = marketingTag();
    expect(tag).not.toContain('alert(1)</script>');
    expect(tag).toContain("&quot;");
  });
});

describe("firstPartyTag()", () => {
  it("ships a self-invoking <script> with the surface inlined", () => {
    const tag = firstPartyTag({ surface: "tenant" });
    expect(tag).toMatch(/<script>[\s\S]+<\/script>/);
    expect(tag).toContain('"tenant"');
  });

  it("posts to /__telemetry on page-view", () => {
    const tag = firstPartyTag({ surface: "marketing" });
    expect(tag).toContain("/__telemetry");
    expect(tag).toContain("page-view");
  });

  it("listens for [data-track] clicks and sends element-clicked", () => {
    const tag = firstPartyTag({ surface: "admin" });
    expect(tag).toMatch(/data-track/);
    expect(tag).toContain("element-clicked");
  });

  it("captures uncaught errors and unhandled promise rejections", () => {
    const tag = firstPartyTag({ surface: "admin" });
    expect(tag).toContain("'error'"); // window.addEventListener('error', ...)
    expect(tag).toContain("'unhandledrejection'");
    expect(tag).toContain("client-error");
  });

  it("wraps fetch and reports non-2xx responses as fetch-failed", () => {
    const tag = firstPartyTag({ surface: "admin" });
    expect(tag).toContain("fetch-failed");
    // Must NOT instrument requests to the telemetry endpoint itself or
    // we'd loop indefinitely on errors.
    expect(tag).toContain("/__telemetry");
    expect(tag).toMatch(/url\.indexOf\('\/__telemetry'\)/);
  });

  it("uses sendBeacon when available so the page-unload event still fires", () => {
    const tag = firstPartyTag({ surface: "admin" });
    expect(tag).toContain("navigator.sendBeacon");
  });

  it("dedupes repeated identical errors so a runaway interval can't flood AuditLog", () => {
    const tag = firstPartyTag({ surface: "admin" });
    expect(tag).toContain("seen[key]");
  });

  it("defaults surface to 'marketing' when called with no args", () => {
    const tag = firstPartyTag();
    expect(tag).toContain('"marketing"');
  });
});
