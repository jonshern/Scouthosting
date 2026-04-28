import { describe, it, expect } from "vitest";
import { makeSignedToken, verifySignedToken } from "../lib/signedToken.js";
import { makeRsvpToken, verifyRsvpToken } from "../lib/rsvpToken.js";

describe("signedToken", () => {
  const opts = { secret: "test-secret", ttlSeconds: 60 };

  it("round-trips claims through make + verify", () => {
    const t = makeSignedToken({ kind: "x", uid: "abc" }, opts);
    const claims = verifySignedToken(t, opts);
    expect(claims.kind).toBe("x");
    expect(claims.uid).toBe("abc");
    expect(typeof claims.exp).toBe("number");
  });

  it("rejects a token signed with a different secret", () => {
    const t = makeSignedToken({ x: 1 }, opts);
    expect(verifySignedToken(t, { secret: "other-secret" })).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySignedToken("", opts)).toBeNull();
    expect(verifySignedToken("garbage", opts)).toBeNull();
    expect(verifySignedToken(null, opts)).toBeNull();
    expect(verifySignedToken("a.b.c", opts)).toBeNull();
  });

  it("rejects tampered payload", () => {
    const t = makeSignedToken({ x: 1 }, opts);
    const [, sig] = t.split(".");
    const fake = Buffer.from(JSON.stringify({ x: 2, exp: Math.floor(Date.now() / 1000) + 60 }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifySignedToken(`${fake}.${sig}`, opts)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const t = makeSignedToken({ x: 1 }, { secret: "test-secret", ttlSeconds: -10 });
    expect(verifySignedToken(t, opts)).toBeNull();
  });
});

describe("rsvpToken", () => {
  it("makes a token that verifyRsvpToken accepts", () => {
    const t = makeRsvpToken({ eventId: "e1", name: "Pat", email: "Pat@Example.com" });
    const claims = verifyRsvpToken(t);
    expect(claims).toEqual(
      expect.objectContaining({
        eventId: "e1",
        name: "Pat",
        email: "pat@example.com",
      })
    );
  });

  it("rejects garbage", () => {
    expect(verifyRsvpToken("nope")).toBeNull();
    expect(verifyRsvpToken("")).toBeNull();
    expect(verifyRsvpToken(null)).toBeNull();
  });
});
