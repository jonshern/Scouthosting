import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { passwordLoginAllowedForRole } from "./policy";

// `NODE_ENV` is typed read-only by @types/node — use a writable view
// of `process.env` so the tests can swap it in / out.
const env = process.env as Record<string, string | undefined>;

describe("passwordLoginAllowedForRole", () => {
  const originalNodeEnv = env.NODE_ENV;
  const originalBypass = env.ALLOW_ADMIN_PASSWORD_LOGIN;

  beforeEach(() => {
    delete env.ALLOW_ADMIN_PASSWORD_LOGIN;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalBypass === undefined) delete env.ALLOW_ADMIN_PASSWORD_LOGIN;
    else env.ALLOW_ADMIN_PASSWORD_LOGIN = originalBypass;
  });

  it("non-privileged users may always sign in with a password", () => {
    env.NODE_ENV = "production";
    expect(passwordLoginAllowedForRole({ privileged: false })).toBe(true);
  });

  it("blocks privileged users in production", () => {
    env.NODE_ENV = "production";
    expect(passwordLoginAllowedForRole({ privileged: true })).toBe(false);
  });

  it("allows privileged users in production once two-step sign-in is set up", () => {
    env.NODE_ENV = "production";
    expect(passwordLoginAllowedForRole({ privileged: true, hasSecondStep: true })).toBe(true);
    expect(passwordLoginAllowedForRole({ privileged: true, hasSecondStep: false })).toBe(false);
  });

  it("allows privileged users in production when ALLOW_ADMIN_PASSWORD_LOGIN=1", () => {
    env.NODE_ENV = "production";
    env.ALLOW_ADMIN_PASSWORD_LOGIN = "1";
    expect(passwordLoginAllowedForRole({ privileged: true })).toBe(true);
  });

  it("does not honor any other ALLOW_ADMIN_PASSWORD_LOGIN value", () => {
    env.NODE_ENV = "production";
    env.ALLOW_ADMIN_PASSWORD_LOGIN = "true";
    expect(passwordLoginAllowedForRole({ privileged: true })).toBe(false);
    env.ALLOW_ADMIN_PASSWORD_LOGIN = "yes";
    expect(passwordLoginAllowedForRole({ privileged: true })).toBe(false);
  });

  it("allows privileged users outside production (development)", () => {
    env.NODE_ENV = "development";
    expect(passwordLoginAllowedForRole({ privileged: true })).toBe(true);
  });

  it("allows privileged users outside production (test)", () => {
    env.NODE_ENV = "test";
    expect(passwordLoginAllowedForRole({ privileged: true })).toBe(true);
  });

  it("lets the shared demo accounts use their password on a demo deployment", () => {
    env.NODE_ENV = "production";
    env.DEMO_MODE = "1";
    try {
      expect(passwordLoginAllowedForRole({ privileged: true })).toBe(true);
    } finally {
      delete env.DEMO_MODE;
    }
  });
});
