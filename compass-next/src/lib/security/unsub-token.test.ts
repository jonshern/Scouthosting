import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeUnsubToken, verifyUnsubToken } from "./unsub-token";

describe("unsub-token", () => {
  const ORIG = process.env.UNSUB_SECRET;
  beforeEach(() => {
    process.env.UNSUB_SECRET = "test-unsub-secret";
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env.UNSUB_SECRET;
    else process.env.UNSUB_SECRET = ORIG;
  });

  it("round-trips memberId + orgId", () => {
    const tok = makeUnsubToken({ memberId: "m_1", orgId: "o_1" });
    const claims = verifyUnsubToken(tok);
    expect(claims?.memberId).toBe("m_1");
    expect(claims?.orgId).toBe("o_1");
    expect(claims?.kind).toBe("unsub");
  });

  it("enforces orgId binding when provided", () => {
    const tok = makeUnsubToken({ memberId: "m_1", orgId: "o_1" });
    expect(verifyUnsubToken(tok, { orgId: "o_1" })?.memberId).toBe("m_1");
    expect(verifyUnsubToken(tok, { orgId: "other" })).toBeNull();
  });

  it("rejects forged secret", () => {
    const tok = makeUnsubToken({ memberId: "m_1", orgId: "o_1" });
    process.env.UNSUB_SECRET = "different-secret";
    expect(verifyUnsubToken(tok)).toBeNull();
  });
});
