import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SUPPORT_EMAIL, supportEmail } from "./support";

describe("supportEmail", () => {
  const orig = process.env.SUPPORT_EMAIL;
  afterEach(() => {
    if (orig === undefined) delete process.env.SUPPORT_EMAIL;
    else process.env.SUPPORT_EMAIL = orig;
  });

  it("defaults, and SUPPORT_EMAIL overrides", () => {
    delete process.env.SUPPORT_EMAIL;
    expect(supportEmail()).toBe(DEFAULT_SUPPORT_EMAIL);
    process.env.SUPPORT_EMAIL = " help@troop.example ";
    expect(supportEmail()).toBe("help@troop.example");
  });
});
