import { afterEach, describe, expect, it } from "vitest";
import { mfaLocked, mfaRequiredForOrganizers, requirementRedirect, withNext } from "./requirements";

const env = process.env as Record<string, string | undefined>;
const saved = {
  NODE_ENV: env.NODE_ENV,
  ALLOW_ADMIN_WITHOUT_MFA: env.ALLOW_ADMIN_WITHOUT_MFA,
  DEMO_MODE: env.DEMO_MODE,
};

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
});

const organizer = { adultConfirmed: true, organizer: true, mfaEnrolled: false, totpEnrolled: false, passkeys: 0 };

describe("requirementRedirect", () => {
  it("asks an unconfirmed account to confirm they are an adult first", () => {
    env.NODE_ENV = "production";
    expect(
      requirementRedirect({ ...organizer, adultConfirmed: false }, { organizerSurface: false }),
    ).toBe("/account/confirm-adult");
  });

  it("sends an organizer without two-step sign-in to set it up in production", () => {
    env.NODE_ENV = "production";
    delete env.ALLOW_ADMIN_WITHOUT_MFA;
    expect(requirementRedirect(organizer, { organizerSurface: true })).toBe(
      "/account/security?required=1",
    );
    expect(mfaLocked(organizer)).toBe(true);
  });

  it("lets an organizer with two-step sign-in through", () => {
    env.NODE_ENV = "production";
    expect(requirementRedirect({ ...organizer, mfaEnrolled: true }, { organizerSurface: true })).toBeNull();
  });

  it("does not ask parents and scouts for two-step sign-in", () => {
    env.NODE_ENV = "production";
    expect(
      requirementRedirect({ ...organizer, organizer: false }, { organizerSurface: true }),
    ).toBeNull();
    expect(mfaLocked({ ...organizer, organizer: false })).toBe(false);
  });

  it("only enforces two-step sign-in on organizer surfaces", () => {
    env.NODE_ENV = "production";
    expect(requirementRedirect(organizer, { organizerSurface: false })).toBeNull();
  });

  it("is off outside production and with the staging escape hatch", () => {
    env.NODE_ENV = "development";
    expect(mfaRequiredForOrganizers()).toBe(false);
    env.NODE_ENV = "production";
    env.ALLOW_ADMIN_WITHOUT_MFA = "1";
    expect(mfaRequiredForOrganizers()).toBe(false);
    env.ALLOW_ADMIN_WITHOUT_MFA = "true";
    expect(mfaRequiredForOrganizers()).toBe(true);
  });

  it("is off on a demo deployment, where the accounts are shared", () => {
    env.NODE_ENV = "production";
    delete env.ALLOW_ADMIN_WITHOUT_MFA;
    env.DEMO_MODE = "1";
    expect(mfaRequiredForOrganizers()).toBe(false);
    expect(requirementRedirect(organizer, { organizerSurface: true })).toBeNull();
  });
});

describe("mfaLocked with passkeys", () => {
  it("lets an organizer drop one second step while another remains", () => {
    env.NODE_ENV = "production";
    delete env.ALLOW_ADMIN_WITHOUT_MFA;
    const both = { ...organizer, mfaEnrolled: true, totpEnrolled: true, passkeys: 1 };
    expect(mfaLocked(both, "totp")).toBe(false);
    expect(mfaLocked(both, "passkey")).toBe(false);
    const passkeyOnly = { ...organizer, mfaEnrolled: true, passkeys: 1 };
    expect(mfaLocked(passkeyOnly, "passkey")).toBe(true);
    expect(mfaLocked({ ...passkeyOnly, passkeys: 2 }, "passkey")).toBe(false);
    const totpOnly = { ...organizer, mfaEnrolled: true, totpEnrolled: true };
    expect(mfaLocked(totpOnly, "totp")).toBe(true);
  });

  it("counts a passkey as two-step sign-in for organizer pages", () => {
    env.NODE_ENV = "production";
    delete env.ALLOW_ADMIN_WITHOUT_MFA;
    expect(
      requirementRedirect({ ...organizer, mfaEnrolled: true, passkeys: 1 }, { organizerSurface: true }),
    ).toBeNull();
  });
});

describe("withNext", () => {
  it("appends next with the right separator", () => {
    expect(withNext("/account/confirm-adult", "/o/t/admin")).toBe(
      "/account/confirm-adult?next=%2Fo%2Ft%2Fadmin",
    );
    expect(withNext("/account/security?required=1", "/x")).toBe(
      "/account/security?required=1&next=%2Fx",
    );
    expect(withNext("/a", null)).toBe("/a");
  });
});
