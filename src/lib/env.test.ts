import { afterEach, describe, expect, it, vi } from "vitest";

const saved = { ...process.env };

async function load(vars: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...saved, DATABASE_URL: "postgresql://x/y", ...vars };
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k];
  return (await import("./env")).env;
}

afterEach(() => {
  process.env = { ...saved };
});

describe("COOKIE_PREFIX", () => {
  it("is compass by default and compass_demo in demo mode", async () => {
    expect((await load({ COOKIE_PREFIX: undefined, DEMO_MODE: undefined })).COOKIE_PREFIX).toBe("compass");
    expect((await load({ COOKIE_PREFIX: undefined, DEMO_MODE: "1" })).COOKIE_PREFIX).toBe("compass_demo");
  });

  it("takes an explicit prefix and refuses one that isn't a plain name", async () => {
    expect((await load({ COOKIE_PREFIX: "waypoint_local" })).COOKIE_PREFIX).toBe("waypoint_local");
    await expect(load({ COOKIE_PREFIX: "bad prefix;" })).rejects.toThrow(/COOKIE_PREFIX/);
  });
});
