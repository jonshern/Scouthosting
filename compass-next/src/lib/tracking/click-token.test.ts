import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeClickToken, makeOpenToken, verifyTrackingToken } from "./click-token";

describe("tracking/click-token", () => {
  const ORIG = process.env.TRACKING_SECRET;
  beforeEach(() => {
    process.env.TRACKING_SECRET = "test-tracking-secret";
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env.TRACKING_SECRET;
    else process.env.TRACKING_SECRET = ORIG;
  });

  it("round-trips an open token", () => {
    const tok = makeOpenToken({ mailLogId: "ml_1", recipient: "X@Y.com" });
    const claims = verifyTrackingToken(tok);
    expect(claims?.kind).toBe("open");
    expect(claims?.recipient).toBe("x@y.com");
    expect(claims?.mailLogId).toBe("ml_1");
  });

  it("verifies a click token only when URL matches the embedded hash", () => {
    const url = "https://example.com/a";
    const tok = makeClickToken({ mailLogId: "ml_1", recipient: "x@y.com", url });
    expect(verifyTrackingToken(tok, { url })?.kind).toBe("click");
    expect(verifyTrackingToken(tok, { url: "https://example.com/b" })).toBeNull();
    expect(verifyTrackingToken(tok)).toBeNull(); // no URL
  });

  it("rejects when secret rotates", () => {
    const tok = makeOpenToken({ mailLogId: "ml_1", recipient: "x@y.com" });
    process.env.TRACKING_SECRET = "rotated";
    expect(verifyTrackingToken(tok)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyTrackingToken("")).toBeNull();
    expect(verifyTrackingToken(null)).toBeNull();
    expect(verifyTrackingToken("nodot")).toBeNull();
  });
});
