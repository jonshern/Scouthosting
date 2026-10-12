import { afterEach, describe, expect, it, vi } from "vitest";
import { _setMailDriverForTests, getMailDriver, mailDriverName } from "./index";

afterEach(() => {
  vi.unstubAllEnvs();
  _setMailDriverForTests(null);
});

function configure(env: Record<string, string | undefined>) {
  _setMailDriverForTests(null);
  vi.stubEnv("MAIL_DRIVER", env.MAIL_DRIVER as string);
  vi.stubEnv("RESEND_API_KEY", env.RESEND_API_KEY as string);
  vi.stubEnv("NODE_ENV", env.NODE_ENV ?? "test");
}

describe("mail driver", () => {
  it("refuses a half-set configuration in production instead of logging mail", () => {
    configure({ MAIL_DRIVER: "resend", RESEND_API_KEY: "", NODE_ENV: "production" });
    expect(() => getMailDriver()).toThrow(/RESEND_API_KEY/);
    configure({ MAIL_DRIVER: "smtp", NODE_ENV: "production" });
    expect(() => getMailDriver()).toThrow(/Unknown MAIL_DRIVER/);
  });

  it("reports what it will do", () => {
    configure({ MAIL_DRIVER: "resend", RESEND_API_KEY: "re_test", NODE_ENV: "production" });
    expect(mailDriverName()).toBe("resend");
    configure({ MAIL_DRIVER: "", NODE_ENV: "production" });
    expect(mailDriverName()).toBe("console");
  });

  it("falls back to console outside production", () => {
    configure({ MAIL_DRIVER: "resend", RESEND_API_KEY: "" });
    expect(mailDriverName()).toBe("console");
  });
});
