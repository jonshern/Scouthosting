import { describe, expect, it } from "vitest";
import { signInNeedsSecondStepCheck } from "./mfa-plugin";

describe("signInNeedsSecondStepCheck", () => {
  it("covers every way Better Auth makes a session from a sign-in", () => {
    expect(signInNeedsSecondStepCheck("/sign-in/email")).toBe(true);
    expect(signInNeedsSecondStepCheck("/sign-in/social")).toBe(true);
    expect(signInNeedsSecondStepCheck("/callback/google")).toBe(true);
    expect(signInNeedsSecondStepCheck("/callback/apple")).toBe(true);
  });

  it("leaves other endpoints alone", () => {
    expect(signInNeedsSecondStepCheck("/get-session")).toBe(false);
    expect(signInNeedsSecondStepCheck("/passkey/sign-in")).toBe(false);
    expect(signInNeedsSecondStepCheck(undefined)).toBe(false);
  });
});
