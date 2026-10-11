import { describe, expect, it } from "vitest";
import { parseLinkGuests, parseLinkResponse } from "./link";

describe("one-click RSVP input", () => {
  it("accepts only yes/no/maybe", () => {
    expect(parseLinkResponse("yes")).toBe("yes");
    expect(parseLinkResponse("maybe")).toBe("maybe");
    expect(parseLinkResponse("YES")).toBeNull();
    expect(parseLinkResponse(undefined)).toBeNull();
  });

  it("clamps guests to 0..20", () => {
    expect(parseLinkGuests("3")).toBe(3);
    expect(parseLinkGuests("-4")).toBe(0);
    expect(parseLinkGuests("1e9")).toBe(20);
    expect(parseLinkGuests("abc")).toBe(0);
  });
});
