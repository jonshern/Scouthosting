// Usage tracking end to end: the collect route, the visitor hash, the
// owner console's reads and the deletes that must take usage with them.
// Runs only with TEST_DATABASE_URL set; cleans up only its own rows.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.K_SERVICE;
});

import { prisma } from "@/lib/db";
import { issueToken } from "@/lib/auth/api-token";
import * as usageRoute from "@/app/api/v1/usage/route";
import { recordAction, sweepUsage } from "./collect";
import { personTimeline, totals, topPages, unitActivity } from "./report";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}`;
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

async function post(body: unknown, headers: Record<string, string> = {}) {
  const req = new NextRequest(`http://${headers.host ?? "localhost"}/api/v1/usage`, {
    method: "POST",
    headers: { "content-type": "text/plain", "user-agent": PHONE_UA, "x-forwarded-for": "203.0.113.9", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = await usageRoute.POST(req, { params: Promise.resolve({}) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown>, cors: res.headers.get("access-control-allow-origin") };
}

describe.skipIf(!db)("usage tracking", () => {
  let org: { id: string; slug: string };
  let adult: { id: string; token: string };
  let scout: { id: string };

  beforeAll(async () => {
    org = await prisma.org.create({
      data: {
        slug: `usage-${S}`,
        unitType: "Troop",
        unitNumber: "7",
        displayName: `Troop 7 ${S}`,
        charterOrg: "Test",
        city: "Test",
        state: "MN",
        scoutmasterName: "Test",
        scoutmasterEmail: `usage-${S}@example.invalid`,
      },
      select: { id: true, slug: true },
    });
    const u = await prisma.user.create({
      data: { email: `usage-adult-${S}@example.invalid`, displayName: `Usage Adult ${S}`, emailVerified: true },
    });
    adult = { id: u.id, token: (await issueToken(u.id, "test", prisma)).raw };
    scout = await prisma.journeyScout.create({ data: { ownerUserId: u.id, encName: Buffer.from("x") }, select: { id: true } });
  });

  afterAll(async () => {
    await prisma.usageEvent.deleteMany({ where: { OR: [{ orgId: org.id }, { userId: adult.id }, { scoutId: scout.id }, { path: { startsWith: `/t-${S}` } }] } });
    await prisma.journeyScout.deleteMany({ where: { id: scout.id } });
    await prisma.apiToken.deleteMany({ where: { userId: adult.id } });
    await prisma.user.deleteMany({ where: { id: adult.id } });
    await prisma.org.deleteMany({ where: { id: org.id } });
  });

  it("records a signed-out landing view with a daily hash and no IP", async () => {
    const r = await post({
      product: "landing",
      events: [{ name: "view", path: `/t-${S}?utm_source=x`, referrer: "https://www.facebook.com/groups/1", source: "Troop_Parents" }],
    });
    expect(r).toMatchObject({ status: 200, json: { ok: true }, cors: "*" });
    const row = await prisma.usageEvent.findFirstOrThrow({ where: { path: `/t-${S}` } });
    expect(row).toMatchObject({
      product: "landing",
      platform: "web",
      role: "visitor",
      referrer: "facebook.com",
      source: "troop_parents",
      device: "phone",
      browser: "Safari",
      userId: null,
    });
    expect(row.visitorHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(row)).not.toContain("203.0.113.9");

    // Same browser, same day: same hash.
    await post({ product: "landing", events: [{ name: "view", path: `/t-${S}/again` }] });
    const again = await prisma.usageEvent.findFirstOrThrow({ where: { path: `/t-${S}/again` } });
    expect(again.visitorHash).toBe(row.visitorHash);
  });

  it("drops crawlers and browsers that ask not to be tracked", async () => {
    await post({ product: "landing", events: [{ name: "view", path: `/t-${S}/gpc` }] }, { "sec-gpc": "1" });
    await post({ product: "landing", events: [{ name: "view", path: `/t-${S}/bot` }] }, { "user-agent": "Googlebot/2.1" });
    expect(await prisma.usageEvent.count({ where: { path: { in: [`/t-${S}/gpc`, `/t-${S}/bot`] } } })).toBe(0);
  });

  it("refuses bad input", async () => {
    expect((await post({ product: "nope", events: [{ name: "view" }] })).json.error).toBe("bad_product");
    expect((await post({ product: "landing", events: [{ name: "Bad Name" }] })).json.error).toBe("bad_name");
    expect((await post("{not json")).json.error).toBe("bad_json");
  });

  it("ties a token's views to the account and the unit, and lists them", async () => {
    await post(
      { product: "waypoint", platform: "ios", events: [{ name: "view", path: `/o/${org.slug}/plans` }, { name: "signed_in" }] },
      { authorization: `Bearer ${adult.token}` },
    );
    const rows = await prisma.usageEvent.findMany({ where: { userId: adult.id }, orderBy: { name: "asc" } });
    expect(rows.map((r) => [r.name, r.path, r.orgId, r.role, r.platform])).toEqual([
      ["signed_in", null, null, "adult", "ios"],
      ["view", "/plans", org.id, "adult", "ios"],
    ]);

    const t = await totals({ days: 1, orgId: org.id });
    expect(t).toMatchObject({ views: 1, signedIn: 1, actions: 0, visitors: 1, visits: 1 });
    expect(await topPages({ days: 1, orgId: org.id })).toEqual([{ product: "waypoint", path: "/plans", views: 1, visitors: 1 }]);
    expect((await unitActivity({ days: 1 })).find((u) => u.orgId === org.id)).toMatchObject({ views: 1, people: 1, actions: 0 });
    expect((await personTimeline(adult.id)).length).toBe(2);
  });

  it("keeps no visitor hash for a scout", async () => {
    await post({ product: "lantern", role: "scout", events: [{ name: "view", path: `/t-${S}/scout` }] });
    const row = await prisma.usageEvent.findFirstOrThrow({ where: { path: `/t-${S}/scout` } });
    expect(row).toMatchObject({ role: "scout", visitorHash: null });
  });

  it("goes with the scout's trail", async () => {
    recordAction("step_checked", { product: "lantern", role: "scout", scoutId: scout.id, props: { steps: 2 } });
    await vi.waitFor(async () => expect(await prisma.usageEvent.count({ where: { scoutId: scout.id } })).toBe(1));
    await prisma.journeyScout.delete({ where: { id: scout.id } });
    expect(await prisma.usageEvent.count({ where: { scoutId: scout.id } })).toBe(0);
  });

  it("sweeps rows past 13 months and old salts", async () => {
    const old = await prisma.usageEvent.create({
      data: { product: "landing", platform: "web", name: "view", role: "visitor", path: `/t-${S}/old`, createdAt: new Date("2020-01-01") },
    });
    await prisma.usageSalt.upsert({ where: { day: "2020-01-01" }, create: { day: "2020-01-01", salt: "x" }, update: {} });
    await sweepUsage();
    expect(await prisma.usageEvent.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.usageSalt.findUnique({ where: { day: "2020-01-01" } })).toBeNull();
  });
});
