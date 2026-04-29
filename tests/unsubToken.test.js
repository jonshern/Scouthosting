import { describe, it, expect, beforeAll } from "vitest";
import { makeUnsubToken, verifyUnsubToken } from "../lib/unsubToken.js";
import { makeSignedToken } from "../lib/signedToken.js";

beforeAll(() => {
  process.env.UNSUB_SECRET = "test-secret-for-unsubtoken-tests";
});

describe("unsubscribe tokens", () => {
  it("round-trips memberId + orgId", () => {
    const t = makeUnsubToken({ memberId: "m1", orgId: "o1" });
    const claims = verifyUnsubToken(t, { orgId: "o1" });
    expect(claims).toBeTruthy();
    expect(claims.memberId).toBe("m1");
    expect(claims.orgId).toBe("o1");
    expect(claims.kind).toBe("unsub");
  });

  it("rejects a token bound to a different org", () => {
    const t = makeUnsubToken({ memberId: "m1", orgId: "o1" });
    expect(verifyUnsubToken(t, { orgId: "other" })).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyUnsubToken("nope", { orgId: "o1" })).toBeNull();
    expect(verifyUnsubToken("", { orgId: "o1" })).toBeNull();
  });

  it("rejects a token with a different kind claim", () => {
    const t = makeSignedToken(
      { kind: "rsvp", memberId: "m1", orgId: "o1" },
      { secret: process.env.UNSUB_SECRET, ttlSeconds: 60 },
    );
    expect(verifyUnsubToken(t, { orgId: "o1" })).toBeNull();
  });
});
