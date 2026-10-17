// Lantern scout devices: the parent's one-time code, pairing, and the
// scout's own token reading and checking off only that trail. Real
// handlers and Postgres; runs only with TEST_DATABASE_URL.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.FLY_APP_NAME;
  delete process.env.K_SERVICE;
});

import { prisma } from "@/lib/db";
import { issueToken } from "@/lib/auth/api-token";
import { normalizeCode, newCode, CODE_ALPHABET } from "@/lib/journey/devices";

import * as scouts from "@/app/api/v1/journey/scouts/route";
import * as scout from "@/app/api/v1/journey/scouts/[id]/route";
import * as progress from "@/app/api/v1/journey/scouts/[id]/progress/route";
import * as pairCode from "@/app/api/v1/journey/scouts/[id]/pair-code/route";
import * as devices from "@/app/api/v1/journey/scouts/[id]/devices/route";
import * as device from "@/app/api/v1/journey/scouts/[id]/devices/[deviceId]/route";
import * as pair from "@/app/api/v1/journey/pair/route";
import * as me from "@/app/api/v1/journey/scout/route";
import * as myProgress from "@/app/api/v1/journey/scout/progress/route";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}d`;

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(
  handler: unknown,
  opts: { token?: string; method?: string; params?: Record<string, string>; query?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: string | undefined;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  const req = new NextRequest(`http://localhost/api/v1/test${opts.query ?? ""}`, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });
  const res = await (handler as Handler)(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = text ? JSON.parse(text) : {};
  return { status: res.status, json, text };
}

type U = { id: string; token: string };
const f = {} as { parent: U; other: U; scoutId: string; otherScoutId: string };

async function makeUser(label: string): Promise<U> {
  const user = await prisma.user.create({ data: { email: `${label}-${S}@example.invalid`, displayName: label, emailVerified: true } });
  return { id: user.id, token: (await issueToken(user.id, "test", prisma)).raw };
}

describe("pair codes", () => {
  it("normalizes what a person types and refuses look-alikes", () => {
    expect(normalizeCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normalizeCode("ABCD EFGH")).toBe("ABCDEFGH");
    expect(normalizeCode("ABCD-EFG0")).toBeNull();
    expect(normalizeCode("ABCD-EFG")).toBeNull();
    const c = newCode();
    expect(c).toHaveLength(8);
    for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
  });
});

describe.skipIf(!db)("Lantern scout devices (Postgres)", () => {
  beforeAll(async () => {
    f.parent = await makeUser("dparent");
    f.other = await makeUser("dother");
    f.scoutId = (await call(scouts.POST, { token: f.parent.token, body: { name: "Emmett", path: ["rank:scout"] } })).json.scout.id;
    f.otherScoutId = (await call(scouts.POST, { token: f.parent.token, body: { name: "Ada" } })).json.scout.id;
  });

  afterAll(async () => {
    const users = [f.parent, f.other].filter(Boolean).map((u) => u.id);
    await prisma.journeyScout.deleteMany({ where: { ownerUserId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.rateLimitBucket.deleteMany({ where: { OR: users.map((u) => ({ key: { startsWith: `v1:user:${u}` } })) } });
  });

  let code = "";
  let scoutToken = "";

  it("only the parent makes a code for their scout", async () => {
    expect((await call(pairCode.POST, { token: f.other.token, method: "POST", params: { id: f.scoutId } })).status).toBe(404);
    const res = await call(pairCode.POST, { token: f.parent.token, method: "POST", params: { id: f.scoutId } });
    expect(res.status).toBe(201);
    expect(res.json.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    code = res.json.code;
  });

  it("a new code retires the old one", async () => {
    const again = await call(pairCode.POST, { token: f.parent.token, method: "POST", params: { id: f.scoutId } });
    expect((await call(pair.POST, { body: { code } })).json).toEqual({ error: "bad_code" });
    code = again.json.code;
  });

  it("the scout's device trades the code for a token once", async () => {
    const res = await call(pair.POST, { body: { code: code.toLowerCase(), label: "Emmett's iPad" } });
    expect(res.status).toBe(201);
    expect(res.json.token).toMatch(/^lantern_scout_[0-9a-f]{64}$/);
    expect(res.json.scout).toMatchObject({ id: f.scoutId, name: "Emmett", path: ["rank:scout"] });
    scoutToken = res.json.token;
    expect((await call(pair.POST, { body: { code } })).status).toBe(400);
  });

  it("an expired code doesn't work", async () => {
    const c = (await call(pairCode.POST, { token: f.parent.token, method: "POST", params: { id: f.otherScoutId } })).json.code;
    await prisma.journeyPairCode.updateMany({ where: { scoutId: f.otherScoutId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await call(pair.POST, { body: { code: c } })).json).toEqual({ error: "bad_code" });
  });

  it("the scout token reads and checks off only that scout's trail", async () => {
    expect((await call(me.GET, { token: scoutToken })).json.scout.id).toBe(f.scoutId);
    const res = await call(myProgress.POST, { token: scoutToken, body: { changes: [{ key: "rank:scout#1a", done: true, on: "2026-10-17" }] } });
    expect(res.status).toBe(200);
    expect(res.json.scout.progress["rank:scout#1a"]).toBe("2026-10-17");
    expect(res.json.scout.checkedBy).toEqual({ "rank:scout#1a": "scout" });
    // The parent sees the same check, marked as the scout's.
    const seen = await call(scout.GET, { token: f.parent.token, params: { id: f.scoutId } });
    expect(seen.json.scout.checkedBy["rank:scout#1a"]).toBe("scout");
    // A parent's check isn't marked.
    const p = await call(progress.POST, { token: f.parent.token, params: { id: f.scoutId }, body: { changes: [{ key: "rank:scout#1b", done: true }] } });
    expect(p.json.scout.checkedBy["rank:scout#1b"]).toBeUndefined();
  });

  it("the scout token is not a grown-up token", async () => {
    expect((await call(scouts.GET, { token: scoutToken })).status).toBe(401);
    expect((await call(scout.GET, { token: scoutToken, params: { id: f.scoutId } })).status).toBe(401);
    expect((await call(scout.GET, { token: scoutToken, params: { id: f.otherScoutId } })).status).toBe(401);
    expect((await call(me.GET, { token: f.parent.token })).status).toBe(401);
    expect((await call(me.GET)).status).toBe(401);
  });

  it("the parent sees the device and can turn it off", async () => {
    expect((await call(devices.GET, { token: f.other.token, params: { id: f.scoutId } })).status).toBe(404);
    const list = await call(devices.GET, { token: f.parent.token, params: { id: f.scoutId } });
    expect(list.json.devices).toHaveLength(1);
    expect(list.json.devices[0].label).toBe("Emmett's iPad");
    const id = list.json.devices[0].id;
    expect((await call(device.DELETE, { token: f.other.token, method: "DELETE", params: { id: f.scoutId, deviceId: id } })).status).toBe(404);
    expect((await call(device.DELETE, { token: f.parent.token, method: "DELETE", params: { id: f.scoutId, deviceId: id } })).status).toBe(200);
    expect((await call(me.GET, { token: scoutToken })).status).toBe(401);
  });

  it("a scout device can sign itself out", async () => {
    const c = (await call(pairCode.POST, { token: f.parent.token, method: "POST", params: { id: f.scoutId } })).json.code;
    const t = (await call(pair.POST, { body: { code: c } })).json.token;
    expect((await call(me.DELETE, { token: t, method: "DELETE" })).status).toBe(200);
    expect((await call(me.GET, { token: t })).status).toBe(401);
  });

  it("deleting the scout removes its devices", async () => {
    const c = (await call(pairCode.POST, { token: f.parent.token, method: "POST", params: { id: f.otherScoutId } })).json.code;
    const t = (await call(pair.POST, { body: { code: c } })).json.token;
    await call(scout.DELETE, { token: f.parent.token, method: "DELETE", params: { id: f.otherScoutId } });
    expect((await call(me.GET, { token: t })).status).toBe(401);
    expect(await prisma.journeyScoutDevice.count({ where: { scoutId: f.otherScoutId } })).toBe(0);
  });
});
