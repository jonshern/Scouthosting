import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/newsletter/cron", () => ({
  runCronTick: vi.fn(async () => ({ schedulesDrafted: 0, schedulesSkipped: 0, rulesFired: 0, errorLogsRetained: 0, trashedMembersPurged: 0 })),
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { POST } from "./route";
import { NextRequest } from "next/server";

const call = (token?: string) =>
  POST(new NextRequest("http://localhost/api/cron/run", { method: "POST", headers: token ? { "x-tasks-token": token } : {} }));

describe("POST /api/cron/run", () => {
  beforeEach(() => {
    process.env.TASKS_TOKEN = "right-token";
  });

  it("refuses without the scheduler token", async () => {
    expect((await call()).status).toBe(403);
    expect((await call("wrong-token")).status).toBe(403);
  });

  it("runs a tick with the token", async () => {
    const res = await call("right-token");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, rulesFired: 0 });
  });
});
