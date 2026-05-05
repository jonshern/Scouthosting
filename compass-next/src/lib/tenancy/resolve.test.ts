import { describe, expect, it } from "vitest";
import { classifyHost } from "./resolve";

describe("classifyHost", () => {
  it("returns apex for the apex host", () => {
    expect(classifyHost("localhost")).toEqual({ kind: "apex" });
    expect(classifyHost("localhost:3000")).toEqual({ kind: "apex" });
  });

  it("treats www.<apex> as apex", () => {
    expect(classifyHost("www.localhost")).toEqual({ kind: "apex" });
  });

  it("extracts the tenant slug from a subdomain", () => {
    expect(classifyHost("troop100.localhost")).toEqual({ kind: "tenant", slug: "troop100" });
    expect(classifyHost("troop100.localhost:3000")).toEqual({ kind: "tenant", slug: "troop100" });
  });

  it("returns custom for an unrelated domain", () => {
    expect(classifyHost("troop42.example.com")).toEqual({
      kind: "custom",
      customDomain: "troop42.example.com",
    });
  });

  it("returns unknown for missing host", () => {
    expect(classifyHost(null)).toEqual({ kind: "unknown" });
    expect(classifyHost(undefined)).toEqual({ kind: "unknown" });
  });

  it("is case-insensitive", () => {
    expect(classifyHost("TROOP100.LOCALHOST")).toEqual({ kind: "tenant", slug: "troop100" });
  });
});
