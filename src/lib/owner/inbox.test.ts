import { describe, expect, it } from "vitest";
import { subjectFrom, trimContext } from "./inbox";

describe("subjectFrom", () => {
  it("uses the first line, cut to 80 characters", () => {
    expect(subjectFrom("Can't add a scout\nIt spins forever")).toBe("Can't add a scout");
    const long = "a".repeat(100);
    expect(subjectFrom(long)).toHaveLength(78);
    expect(subjectFrom("   ")).toBe("(no subject)");
  });
});

describe("trimContext", () => {
  it("keeps small context and drops empty or oversized", () => {
    expect(trimContext({ appVersion: "1.2.0", platform: "ios" })).toEqual({ appVersion: "1.2.0", platform: "ios" });
    expect(trimContext({})).toBeNull();
    expect(trimContext(undefined)).toBeNull();
    expect(trimContext({ blob: "x".repeat(5000) })).toBeNull();
  });
});
