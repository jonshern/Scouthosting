import { describe, expect, it } from "vitest";
import { makeSignedToken, verifySignedToken } from "./signed-token";

const SECRET = "test-signed-token-secret-not-used-in-prod";

describe("signed-token", () => {
  it("round-trips claims", () => {
    const tok = makeSignedToken({ a: 1, b: "two" }, { secret: SECRET, ttlSeconds: 60 });
    const claims = verifySignedToken<{ a: number; b: string; exp: number }>(tok, {
      secret: SECRET,
    });
    expect(claims?.a).toBe(1);
    expect(claims?.b).toBe("two");
    expect(typeof claims?.exp).toBe("number");
  });

  it("rejects a token signed with a different secret", () => {
    const tok = makeSignedToken({ x: 1 }, { secret: SECRET, ttlSeconds: 60 });
    expect(verifySignedToken(tok, { secret: "other" })).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const tok = makeSignedToken({ x: 1 }, { secret: SECRET, ttlSeconds: 60 });
    const [, sig] = tok.split(".");
    const fake = Buffer.from(JSON.stringify({ x: 2, exp: Math.floor(Date.now() / 1000) + 60 }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifySignedToken(`${fake}.${sig}`, { secret: SECRET })).toBeNull();
  });

  it("rejects expired tokens", () => {
    const tok = makeSignedToken({ x: 1 }, { secret: SECRET, ttlSeconds: -1 });
    expect(verifySignedToken(tok, { secret: SECRET })).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifySignedToken("", { secret: SECRET })).toBeNull();
    expect(verifySignedToken("nodot", { secret: SECRET })).toBeNull();
    expect(verifySignedToken(null, { secret: SECRET })).toBeNull();
    expect(verifySignedToken(undefined, { secret: SECRET })).toBeNull();
  });

  it("requires secret on make", () => {
    expect(() => makeSignedToken({}, { secret: "", ttlSeconds: 60 })).toThrow(/secret required/);
  });
});
