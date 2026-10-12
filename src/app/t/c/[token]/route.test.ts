import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: { mailLog: { findUnique: vi.fn(async () => null) }, mailEvent: { create: vi.fn() } },
}));

import { GET } from "./route";
import { makeClickToken } from "@/lib/tracking/click-token";

const hit = (token: string, to: string) =>
  GET(new NextRequest(`http://localhost/t/c/${token}?to=${encodeURIComponent(to)}`));

describe("click tracking redirect", () => {
  it("redirects to the URL the token was signed for", async () => {
    const to = "https://example.org/campout";
    const token = makeClickToken({ mailLogId: "m1", recipient: "a@example.invalid", url: to });
    const res = await hit(token, to);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(to);
  });

  it("does not redirect anywhere on a forged or mismatched token", async () => {
    const token = makeClickToken({ mailLogId: "m1", recipient: "a@example.invalid", url: "https://example.org/" });
    for (const t of ["forged.token", token]) {
      const res = await hit(t, "https://phish.example/login");
      expect(res.headers.get("location")).toBeNull();
      expect(await res.text()).toContain("phish.example");
    }
    const js = await hit("forged.token", "javascript:alert(1)");
    expect(js.status).toBe(400);
    expect(await js.text()).not.toContain("javascript:");
  });
});
