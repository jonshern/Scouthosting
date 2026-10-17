import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// What the next custom-domain lookup does: a slug, or "down".
let db: { slug: string } | "down" = "down";
vi.mock("@/lib/db", () => ({
  prisma: {
    org: {
      findUnique: async () => {
        if (db === "down") throw new Error("connection refused");
        return db;
      },
    },
  },
}));

import { middleware } from "./middleware";

const hit = (host: string) => middleware(new NextRequest(`http://${host}/calendar`, { headers: { host } }));

describe("middleware on a custom domain", () => {
  it("rewrites to the unit's pages", async () => {
    db = { slug: "troop12" };
    const res = await hit("troop12-ok.example.org");
    expect(res.headers.get("x-middleware-rewrite")).toContain("/o/troop12/calendar");
  });

  it("answers 503 with a retry when the database is down, not a crash", async () => {
    db = "down";
    const res = await hit("troop12-down.example.org");
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
  });

  it("keeps serving a domain it already knows while the database is down", async () => {
    vi.useFakeTimers();
    db = { slug: "troop7" };
    await hit("troop7.example.org");
    vi.advanceTimersByTime(120_000); // past the cache TTL
    db = "down";
    const res = await hit("troop7.example.org");
    expect(res.headers.get("x-middleware-rewrite")).toContain("/o/troop7/calendar");
    vi.useRealTimers();
  });
});
