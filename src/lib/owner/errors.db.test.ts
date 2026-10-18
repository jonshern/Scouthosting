// App crash reports and server errors grouped for the owner console.
// Runs only with TEST_DATABASE_URL set; cleans up only its own rows.

import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.K_SERVICE;
});

import { prisma } from "@/lib/db";
import * as errorsRoute from "@/app/api/v1/errors/route";
import { errorGroups, isFixed } from "./errors";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}`;
const MESSAGE = `Cannot read properties of undefined (trail ${S})`;

async function report(body: unknown) {
  const req = new NextRequest("http://localhost/api/v1/errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await errorsRoute.POST(req, { params: Promise.resolve({}) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("isFixed", () => {
  it("is fixed only while nothing happened after the fix", () => {
    const fix = new Date("2026-10-18T10:00:00Z");
    expect(isFixed(new Date("2026-10-18T09:00:00Z"), fix)).toBe(true);
    expect(isFixed(new Date("2026-10-18T11:00:00Z"), fix)).toBe(false);
    expect(isFixed(new Date(), null)).toBe(false);
  });
});

describe.skipIf(!db)("app crash reports", () => {
  afterAll(async () => {
    const rows = await prisma.errorLog.findMany({ where: { message: MESSAGE }, select: { fingerprint: true } });
    await prisma.errorResolution.deleteMany({ where: { fingerprint: { in: rows.map((r) => r.fingerprint) } } });
    await prisma.errorLog.deleteMany({ where: { message: MESSAGE } });
  });

  it("files a Lantern crash signed out and groups repeats", async () => {
    const body = {
      product: "lantern",
      name: "TypeError",
      message: MESSAGE,
      context: { appVersion: "1.4.0", platform: "android", screen: "trail" },
    };
    expect((await report(body)).status).toBe(200);
    expect((await report(body)).status).toBe(200);
    expect((await report({ ...body, product: "nope" })).json.error).toBe("bad_product");

    const groups = await errorGroups({ days: 1, service: "lantern-app" });
    const g = groups.find((x) => x.message === MESSAGE);
    expect(g).toMatchObject({ count: 2, service: "lantern-app", name: "TypeError", fixed: false });

    await prisma.errorResolution.create({ data: { fingerprint: g!.fingerprint } });
    expect((await errorGroups({ days: 1, service: "lantern-app" })).some((x) => x.message === MESSAGE)).toBe(false);
    // Happens again after the fix: back in the list.
    await report(body);
    const again = (await errorGroups({ days: 1, service: "lantern-app" })).find((x) => x.message === MESSAGE);
    expect(again).toMatchObject({ count: 3, fixed: false });
    expect(again?.fixedAt).not.toBeNull();
  });
});
