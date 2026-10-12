import { describe, expect, it } from "vitest";
import { basePathFor } from "./base-path";

describe("basePathFor", () => {
  it("is bare when middleware served the unit on its own host", () => {
    expect(basePathFor("troop100", "troop100")).toBe("");
  });

  it("is prefixed anywhere else", () => {
    expect(basePathFor(null, "troop100")).toBe("/o/troop100");
    expect(basePathFor("troop200", "troop100")).toBe("/o/troop100");
  });
});
