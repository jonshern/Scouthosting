import { describe, expect, it } from "vitest";
import { cleanPath, cleanProps, cleanSource, deviceInfo, isBot, referrerHost } from "./events";

describe("cleanPath", () => {
  it("drops the query, the fragment and the origin", () => {
    expect(cleanPath("https://compass.example/start?invite=abc#top").path).toBe("/start");
    expect(cleanPath("/trail?scout=1").path).toBe("/trail");
  });

  it("replaces ids and tokens and keeps page names", () => {
    expect(cleanPath("/admin/roster/cm2x9k3l40000abcdefgh1234").path).toBe("/admin/roster/:id");
    expect(cleanPath("/reset/4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c").path).toBe("/reset/:id");
    expect(cleanPath("/events/12345").path).toBe("/events/:id");
    expect(cleanPath("/invite/jon%40example.com").path).toBe("/invite/:id");
    expect(cleanPath("/verify-email/eyJhbGciOiJIUzI1NiJ9xyz123").path).toBe("/verify-email/:id");
    expect(cleanPath("/badge-days/plumbing-day-2026").path).toBe("/badge-days/plumbing-day-2026");
  });

  it("moves a unit's /o/<slug> prefix out of the path", () => {
    expect(cleanPath("/o/troop100/admin/roster")).toEqual({ path: "/admin/roster", slug: "troop100" });
    expect(cleanPath("/o/troop100")).toEqual({ path: "/", slug: "troop100" });
  });

  it("gives app screen names a leading slash", () => {
    expect(cleanPath("trail").path).toBe("/trail");
    expect(cleanPath("").path).toBeNull();
    expect(cleanPath(null).path).toBeNull();
  });
});

describe("referrerHost", () => {
  it("keeps only the host, and drops our own site", () => {
    expect(referrerHost("https://www.google.com/search?q=troop+website")).toBe("google.com");
    expect(referrerHost("https://compass.example/start", "compass.example")).toBeNull();
    expect(referrerHost("android-app://com.slack")).toBeNull();
    expect(referrerHost("not a url")).toBeNull();
  });
});

describe("cleanSource", () => {
  it("lowercases and strips odd characters", () => {
    expect(cleanSource("Facebook Group!")).toBe("facebookgroup");
    expect(cleanSource("")).toBeNull();
  });
});

describe("isBot", () => {
  it("spots crawlers and test browsers", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/131.0 Safari/537.36")).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isBot(null)).toBe(false);
  });
});

describe("deviceInfo", () => {
  it("knows phones, tablets and desktops, and the browser family", () => {
    expect(deviceInfo("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1", "web")).toEqual({ device: "phone", browser: "Safari" });
    expect(deviceInfo("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1", "web").device).toBe("tablet");
    expect(deviceInfo("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0 Safari/537.36", "web")).toEqual({ device: "desktop", browser: "Chrome" });
    expect(deviceInfo("okhttp/4.12.0", "android")).toEqual({ device: "phone", browser: null });
  });
});

describe("cleanProps", () => {
  it("keeps short scalars only", () => {
    expect(cleanProps({ steps: 3, by: "scout", ok: true, nested: { a: 1 }, "bad key": 1, long: "x".repeat(300) })).toEqual({
      steps: 3,
      by: "scout",
      ok: true,
      long: "x".repeat(100),
    });
    expect(cleanProps([1, 2])).toBeNull();
    expect(cleanProps({})).toBeNull();
  });
});
