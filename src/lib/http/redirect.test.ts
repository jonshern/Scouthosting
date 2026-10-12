import { describe, expect, it } from "vitest";
import { redirectTo, sameSitePath } from "./redirect";

describe("redirectTo", () => {
  it("sends a relative Location so the browser keeps its own host", () => {
    const res = redirectTo("/login?next=%2Fo%2Ft1", 303);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login?next=%2Fo%2Ft1");
  });

  it("refuses anything that would leave the site", () => {
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", ""]) {
      expect(sameSitePath(bad)).toBe("/");
    }
    expect(redirectTo("//evil.example").headers.get("location")).toBe("/");
  });
});
