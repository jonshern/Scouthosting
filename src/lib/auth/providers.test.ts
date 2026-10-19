import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appleClientSecret,
  appleConfig,
  appleConfigured,
  enabledSocialProviders,
  extraSignInHostPatterns,
  googleConfig,
  signInHref,
} from "./providers";

const KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "APPLE_CLIENT_ID",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
  "APPLE_PRIVATE_KEY_PEM",
  "APPLE_REDIRECT_URI",
  "PASSKEY_EXTRA_HOSTS",
  "WEB_SIGNIN_ORIGINS",
];

function clearEnv() {
  for (const k of KEYS) vi.stubEnv(k, "");
}

function applePem(): string {
  const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("which providers are offered", () => {
  it("offers none without keys", () => {
    clearEnv();
    expect(enabledSocialProviders()).toEqual([]);
    expect(googleConfig()).toBeNull();
    expect(appleConfig()).toBeNull();
  });

  it("offers Google with only a client id and secret, redirect URI per host", () => {
    clearEnv();
    vi.stubEnv("GOOGLE_CLIENT_ID", "id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    expect(enabledSocialProviders()).toEqual(["google"]);
    expect(googleConfig()).toEqual({ clientId: "id.apps.googleusercontent.com", clientSecret: "secret" });
  });

  it("pins the redirect URI when GOOGLE_REDIRECT_URI is set", () => {
    clearEnv();
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "https://compass.app/api/auth/google/callback");
    expect(googleConfig()?.redirectURI).toBe("https://compass.app/api/auth/google/callback");
  });

  it("needs every Apple key, and lists Google before Apple", () => {
    clearEnv();
    vi.stubEnv("APPLE_CLIENT_ID", "app.compass.signin");
    vi.stubEnv("APPLE_TEAM_ID", "TEAM123456");
    expect(appleConfigured()).toBe(false);
    vi.stubEnv("APPLE_KEY_ID", "KEY1234567");
    vi.stubEnv("APPLE_PRIVATE_KEY", applePem().replace(/\n/g, "\\n"));
    expect(appleConfigured()).toBe(true);
    const cfg = appleConfig();
    expect(cfg?.clientId).toBe("app.compass.signin");
    expect(cfg?.redirectURI).toBeUndefined();
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    expect(enabledSocialProviders()).toEqual(["google", "apple"]);
  });
});

describe("appleClientSecret", () => {
  it("is an ES256 JWT for Apple with the team, key and Services ID", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwt = appleClientSecret(
      {
        teamId: "TEAM123456",
        keyId: "KEY1234567",
        clientId: "app.compass.signin",
        privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      },
      new Date("2026-10-19T00:00:00Z"),
    );
    const [h, p, s] = jwt.split(".");
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(header).toMatchObject({ alg: "ES256", kid: "KEY1234567" });
    expect(payload).toMatchObject({ iss: "TEAM123456", sub: "app.compass.signin", aud: "https://appleid.apple.com" });
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(60 * 60 * 24 * 180);
    const ok = crypto.verify(
      "sha256",
      Buffer.from(`${h}.${p}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(s, "base64url"),
    );
    expect(ok).toBe(true);
  });
});

describe("extraSignInHostPatterns", () => {
  it("turns PASSKEY_EXTRA_HOSTS into host and host:port patterns", () => {
    vi.stubEnv("WEB_SIGNIN_ORIGINS", "");
    vi.stubEnv("PASSKEY_EXTRA_HOSTS", " Jons-Mac.tail1234.ts.net:8443 , https://other.example/ ,");
    expect(extraSignInHostPatterns()).toEqual([
      "jons-mac.tail1234.ts.net",
      "jons-mac.tail1234.ts.net:*",
      "other.example",
      "other.example:*",
    ]);
  });

  it("adds the website origins that sign in through Compass", () => {
    vi.stubEnv("PASSKEY_EXTRA_HOSTS", "jons-mac.tail1234.ts.net");
    vi.stubEnv("WEB_SIGNIN_ORIGINS", "https://waypoint.example.org,https://jons-mac.tail1234.ts.net:8443");
    expect(extraSignInHostPatterns()).toEqual([
      "jons-mac.tail1234.ts.net",
      "jons-mac.tail1234.ts.net:*",
      "waypoint.example.org",
      "jons-mac.tail1234.ts.net:8443",
    ]);
  });

  it("is empty when unset", () => {
    vi.stubEnv("PASSKEY_EXTRA_HOSTS", "");
    vi.stubEnv("WEB_SIGNIN_ORIGINS", "");
    expect(extraSignInHostPatterns()).toEqual([]);
  });
});

describe("signInHref", () => {
  const apexOrigin = "https://compass.app";

  it("starts on this host from the apex or an extra host", () => {
    expect(signInHref("google", null, { apexOrigin })).toBe("/api/auth/google/begin");
    expect(signInHref("apple", "/auth/mobile/begin?redirect=lantern://auth/callback", { apexOrigin })).toBe(
      "/api/auth/apple/begin?next=%2Fauth%2Fmobile%2Fbegin%3Fredirect%3Dlantern%3A%2F%2Fauth%2Fcallback",
    );
  });

  it("sends a unit's own host to the apex and back to the unit's pages", () => {
    expect(signInHref("google", "/admin", { tenantSlug: "troop100", apexOrigin })).toBe(
      "https://compass.app/api/auth/google/begin?next=%2Fo%2Ftroop100%2Fadmin",
    );
    expect(signInHref("google", null, { tenantSlug: "troop100", apexOrigin })).toBe(
      "https://compass.app/api/auth/google/begin?next=%2Fo%2Ftroop100",
    );
  });

  it("keeps paths every host shares", () => {
    expect(signInHref("google", "/start", { tenantSlug: "troop100", apexOrigin })).toBe(
      "https://compass.app/api/auth/google/begin?next=%2Fstart",
    );
    expect(signInHref("google", "/o/troop100/calendar", { tenantSlug: "troop100", apexOrigin })).toBe(
      "https://compass.app/api/auth/google/begin?next=%2Fo%2Ftroop100%2Fcalendar",
    );
  });

  it("drops an off-site next on a unit's host", () => {
    expect(signInHref("google", "//evil.example", { tenantSlug: "troop100", apexOrigin })).toBe(
      "https://compass.app/api/auth/google/begin?next=%2Fo%2Ftroop100",
    );
  });
});
