import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reset = vi.hoisted(() => ({ resetDemo: vi.fn() }));
vi.mock("@/lib/demo/reset", async (orig) => ({ ...(await orig<typeof import("@/lib/demo/reset")>()), resetDemo: reset.resetDemo }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { POST } from "./route";
import { DemoResetRefused } from "@/lib/demo/reset";
import { NextRequest } from "next/server";

const env = process.env as Record<string, string | undefined>;
const call = (token?: string) =>
  POST(new NextRequest("http://localhost/api/demo/reset", { method: "POST", headers: token ? { "x-tasks-token": token } : {} }));

describe("POST /api/demo/reset", () => {
  beforeEach(() => {
    env.TASKS_TOKEN = "right-token";
    env.DEMO_MODE = "1";
    reset.resetDemo.mockReset();
  });
  afterEach(() => {
    delete env.DEMO_MODE;
  });

  it("doesn't exist outside demo mode", async () => {
    delete env.DEMO_MODE;
    expect((await call("right-token")).status).toBe(404);
    expect(reset.resetDemo).not.toHaveBeenCalled();
  });

  it("needs the scheduler token", async () => {
    expect((await call()).status).toBe(403);
    expect((await call("wrong-token")).status).toBe(403);
    expect(reset.resetDemo).not.toHaveBeenCalled();
  });

  it("resets and reports what it seeded", async () => {
    reset.resetDemo.mockResolvedValue({ slug: "troop42", members: 25 });
    const res = await call("right-token");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, slug: "troop42", members: 25 });
  });

  it("says why when the database isn't safe to wipe", async () => {
    reset.resetDemo.mockRejectedValue(new DemoResetRefused("has 1 real unit(s)"));
    const res = await call("right-token");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "refused" });
  });
});
