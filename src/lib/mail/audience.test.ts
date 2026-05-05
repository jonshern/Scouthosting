import { describe, expect, it } from "vitest";
import { AUDIENCE_LABELS, describeAudience } from "./audience";

describe("describeAudience", () => {
  it("returns the canonical label for the simple kinds", () => {
    expect(describeAudience({ kind: "everyone" })).toBe(AUDIENCE_LABELS.everyone);
    expect(describeAudience({ kind: "adults" })).toBe(AUDIENCE_LABELS.adults);
    expect(describeAudience({ kind: "youth" })).toBe(AUDIENCE_LABELS.youth);
    expect(describeAudience({ kind: "leaders" })).toBe(AUDIENCE_LABELS.leaders);
  });
  it("includes the patrol name when kind=patrol", () => {
    expect(describeAudience({ kind: "patrol", patrol: "Eagles" })).toBe("Patrol: Eagles");
    expect(describeAudience({ kind: "patrol" })).toBe("Patrol");
  });
});
