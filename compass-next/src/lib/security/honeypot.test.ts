import { describe, expect, it } from "vitest";
import { checkHoneypot, honeypotField, honeypotTimingField, makeHoneypotStamp } from "./honeypot";

describe("honeypot", () => {
  it("rejects forms where the trap is filled", () => {
    const stamp = makeHoneypotStamp(1000);
    const result = checkHoneypot({ [honeypotField]: "spam@spam.com", [honeypotTimingField]: stamp }, 5000);
    expect(result).toEqual({ ok: false, reason: "filled" });
  });

  it("rejects forms missing the timing stamp", () => {
    const result = checkHoneypot({ [honeypotField]: "" }, 5000);
    expect(result).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects forms submitted too fast", () => {
    const stamp = makeHoneypotStamp(1000);
    const result = checkHoneypot({ [honeypotField]: "", [honeypotTimingField]: stamp }, 1500);
    expect(result).toEqual({ ok: false, reason: "too-fast" });
  });

  it("accepts forms with empty trap and adequate dwell time", () => {
    const stamp = makeHoneypotStamp(1000);
    const result = checkHoneypot({ [honeypotField]: "", [honeypotTimingField]: stamp }, 5000);
    expect(result).toEqual({ ok: true });
  });
});
