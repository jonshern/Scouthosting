import { afterEach, describe, expect, it } from "vitest";
import { linkSecret } from "./link-secret";
import { makeRsvpToken, verifyRsvpToken } from "./rsvp-token";

const env = process.env as Record<string, string | undefined>;
const KEYS = ["NODE_ENV", "RSVP_SECRET", "SESSION_SECRET", "BETTER_AUTH_SECRET"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, env[k]]));
const LONG = "x".repeat(32);

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
});

function clear() {
  for (const k of KEYS) delete env[k];
}

describe("linkSecret", () => {
  it("prefers the link's own variable, then SESSION_SECRET, then BETTER_AUTH_SECRET", () => {
    clear();
    env.BETTER_AUTH_SECRET = "b".repeat(32);
    expect(linkSecret(["RSVP_SECRET"], "dev")).toBe("b".repeat(32));
    env.SESSION_SECRET = "s".repeat(32);
    expect(linkSecret(["RSVP_SECRET"], "dev")).toBe("s".repeat(32));
    env.RSVP_SECRET = "r".repeat(32);
    expect(linkSecret(["RSVP_SECRET"], "dev")).toBe("r".repeat(32));
  });

  it("uses the built-in key only outside production", () => {
    clear();
    env.NODE_ENV = "development";
    expect(linkSecret(["RSVP_SECRET"], "dev")).toBe("dev");
    env.NODE_ENV = "production";
    expect(() => linkSecret(["RSVP_SECRET"], "dev")).toThrow(/RSVP_SECRET/);
  });

  it("refuses a short secret in production", () => {
    clear();
    env.NODE_ENV = "production";
    env.RSVP_SECRET = "short";
    expect(() => linkSecret(["RSVP_SECRET"], "dev")).toThrow(/at least 32/);
    env.RSVP_SECRET = LONG;
    expect(linkSecret(["RSVP_SECRET"], "dev")).toBe(LONG);
  });

  it("makes RSVP links refuse to sign or verify without a secret in production", () => {
    clear();
    env.NODE_ENV = "development";
    const token = makeRsvpToken({ eventId: "e", name: "A", email: "a@b.co" });
    env.NODE_ENV = "production";
    expect(() => verifyRsvpToken(token)).toThrow();
    expect(() => makeRsvpToken({ eventId: "e", name: "A", email: "a@b.co" })).toThrow();
  });
});
