import { describe, expect, it } from "vitest";
import { marketingHrefFor } from "./marketing-link";

describe("marketingHrefFor", () => {
  const origin = "http://localhost:3000";
  it("keeps bare paths on the main site", () => {
    expect(marketingHrefFor(null, "/plans", origin)).toBe("/plans");
  });
  it("points troop and custom-domain hosts at the main site", () => {
    expect(marketingHrefFor("troop100", "/plans", origin)).toBe("http://localhost:3000/plans");
    expect(marketingHrefFor("troop12", "/pitch", origin)).toBe("http://localhost:3000/pitch");
  });
});
