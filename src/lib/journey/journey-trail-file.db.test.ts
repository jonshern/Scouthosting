// Export and import of a whole Lantern trail (trail-file.ts) through the
// real routes and Postgres: download everything, lose the scout, import
// it back, and check nothing is missing. Runs only with TEST_DATABASE_URL.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.FLY_APP_NAME;
  delete process.env.K_SERVICE;
  process.env.LOCAL_UPLOADS_DIR ??= `/tmp/compass-journey-trail-${process.pid}`;
});

import { prisma } from "@/lib/db";
import { issueToken } from "@/lib/auth/api-token";
import { unzip } from "./zip";

import * as scouts from "@/app/api/v1/journey/scouts/route";
import * as scout from "@/app/api/v1/journey/scouts/[id]/route";
import * as entries from "@/app/api/v1/journey/scouts/[id]/entries/route";
import * as photo from "@/app/api/v1/journey/scouts/[id]/entries/photo/route";
import * as photoGet from "@/app/api/v1/journey/scouts/[id]/entries/[entryId]/photo/route";
import * as exportRoute from "@/app/api/v1/journey/scouts/[id]/export/route";
import * as importRoute from "@/app/api/v1/journey/import/route";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}t`;

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(
  handler: unknown,
  opts: { token?: string; method?: string; params?: Record<string, string>; query?: string; body?: unknown; raw?: Buffer; form?: FormData } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined = opts.form;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  if (opts.raw) {
    body = new Uint8Array(opts.raw);
    headers["content-type"] = "application/zip";
  }
  const req = new NextRequest(`http://localhost/api/v1/test${opts.query ?? ""}`, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });
  return (handler as Handler)(req, { params: Promise.resolve(opts.params ?? {}) });
}
const asJson = async (res: Response) => ({ status: res.status, json: await res.json() });

type U = { id: string; token: string };
const f = {} as { parent: U; stranger: U; scoutId: string };

async function makeUser(label: string): Promise<U> {
  const user = await prisma.user.create({
    data: { email: `${label}-${S}@example.invalid`, displayName: `${label} ${S}`, emailVerified: true },
  });
  return { id: user.id, token: (await issueToken(user.id, "test", prisma)).raw };
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const PROGRESS = { "rank:scout": true, "rank:tenderfoot#1a": "2026-10-01", "rank:tenderfoot#4b": "2026-10-05", "custom:knots1#1": true } as const;
const CUSTOM = { "custom:knots1": { key: "custom:knots1", name: "Knots", kind: "custom", reqs: [{ n: "1", t: "Bowline", subs: [] }] } };

describe.skipIf(!db)("Lantern trail export and import (Postgres)", () => {
  beforeAll(async () => {
    f.parent = await makeUser("tparent");
    f.stranger = await makeUser("tstranger");
    const res = await asJson(
      await call(scouts.POST, {
        token: f.parent.token,
        body: { name: "Emmett", path: ["rank:scout", "rank:tenderfoot", "custom:knots1"], custom: CUSTOM, progress: PROGRESS },
      }),
    );
    f.scoutId = res.json.scout.id;
    await call(entries.POST, {
      token: f.parent.token,
      params: { id: f.scoutId },
      body: {
        put: [
          { clientId: "d1", key: "rank:second-class#7a", kind: "log", day: "2026-10-19", amount: 30, unit: "minutes", text: "Bike" },
          { clientId: "n1", key: "badge:camping#9a", kind: "note", text: "Two nights at Portage Lake" },
        ],
      },
    });
    const form = new FormData();
    form.set("photo", new Blob([PNG], { type: "image/png" }), "proof.png");
    form.set("clientId", "p1");
    form.set("key", "badge:woodwork#5");
    form.set("text", "My birdhouse");
    await call(photo.POST, { token: f.parent.token, params: { id: f.scoutId }, form });
  });

  afterAll(async () => {
    const users = [f.parent, f.stranger].filter(Boolean).map((u) => u.id);
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.rateLimitBucket.deleteMany({
      where: { OR: users.map((u) => ({ key: { startsWith: `v1:user:${u}` } })) },
    });
  });

  const full = async (id: string) => (await asJson(await call(scout.GET, { token: f.parent.token, params: { id } }))).json.scout;
  const entryList = async (id: string) =>
    (await asJson(await call(entries.GET, { token: f.parent.token, params: { id } }))).json.entries.map(
      (e: { id: string; key: string; kind: string; text: string | null; amount: number | null; photo: boolean }) => [e.id, e.key, e.kind, e.text, e.amount, e.photo],
    );

  it("needs the owner", async () => {
    expect((await call(exportRoute.GET, { params: { id: f.scoutId } })).status).toBe(401);
    expect((await call(exportRoute.GET, { token: f.stranger.token, params: { id: f.scoutId } })).status).toBe(404);
    const res = await call(importRoute.POST, { token: f.stranger.token, query: `?into=${f.scoutId}`, body: { format: "lantern-trail", version: 1, scout: {}, entries: [] } });
    expect(res.status).toBe(404);
  });

  it("downloads the trail as JSON, a spreadsheet, and a zip with the photos", async () => {
    const j = await call(exportRoute.GET, { token: f.parent.token, params: { id: f.scoutId } });
    expect(j.status).toBe(200);
    expect(j.headers.get("content-disposition")).toMatch(/attachment; filename="emmett-trail-\d{4}-\d\d-\d\d\.json"/);
    const file = await j.json();
    expect(file).toMatchObject({ format: "lantern-trail", version: 1, source: "compass", scout: { name: "Emmett", progress: PROGRESS } });
    expect(file.entries.map((e: { id: string }) => e.id).sort()).toEqual(["d1", "n1", "p1"]);
    expect(file.entries.find((e: { id: string }) => e.id === "p1").photo).toEqual({ file: "photos/p1.png", mimeType: "image/png" });

    const x = await call(exportRoute.GET, { token: f.parent.token, params: { id: f.scoutId }, query: "?format=xlsx" });
    expect(x.headers.get("content-type")).toContain("spreadsheetml");
    const book = unzip(Buffer.from(await x.arrayBuffer()), { maxFiles: 20, maxBytes: 1e7 });
    expect(book.get("xl/worksheets/sheet3.xml")!.toString()).toContain("Portage Lake");

    const z = await call(exportRoute.GET, { token: f.parent.token, params: { id: f.scoutId }, query: "?format=zip" });
    const parts = unzip(Buffer.from(await z.arrayBuffer()), { maxFiles: 20, maxBytes: 1e7 });
    expect([...parts.keys()].sort()).toEqual(["photos/p1.png", "trail.json", "trail.xlsx"]);
    expect(parts.get("photos/p1.png")!.equals(PNG)).toBe(true);
  });

  it("brings a lost scout back from the zip, photos and all", async () => {
    const before = { scout: await full(f.scoutId), entries: await entryList(f.scoutId) };
    const z = Buffer.from(await (await call(exportRoute.GET, { token: f.parent.token, params: { id: f.scoutId }, query: "?format=zip" })).arrayBuffer());
    await call(scout.DELETE, { token: f.parent.token, params: { id: f.scoutId }, method: "DELETE" });

    const res = await asJson(await call(importRoute.POST, { token: f.parent.token, raw: z }));
    expect(res.status).toBe(200);
    expect(res.json.imported).toEqual({ steps: 4, entries: 3, photos: 1, skipped: 0 });
    const back = res.json.scout;
    expect(back).toMatchObject({ name: "Emmett", path: before.scout.path, custom: before.scout.custom, progress: before.scout.progress });
    expect(await entryList(back.id)).toEqual(before.entries);
    const got = await call(photoGet.GET, { token: f.parent.token, params: { id: back.id, entryId: "p1" } });
    expect(Buffer.from(await got.arrayBuffer()).equals(PNG)).toBe(true);
    f.scoutId = back.id;
  });

  it("adds only what's missing to a scout, never unchecking or overwriting", async () => {
    const old = await (await call(exportRoute.GET, { token: f.parent.token, params: { id: f.scoutId } })).json();
    // Since that copy: one step unchecked, one new step, the log edited.
    await call(scout.PATCH, { token: f.parent.token, params: { id: f.scoutId }, method: "PATCH", body: { path: ["rank:scout", "rank:tenderfoot"] } });
    await call((await import("@/app/api/v1/journey/scouts/[id]/progress/route")).POST, {
      token: f.parent.token,
      params: { id: f.scoutId },
      body: { changes: [{ key: "rank:tenderfoot#4b", done: false }, { key: "rank:tenderfoot#2a", done: true, on: "2026-10-16" }] },
    });
    await call(entries.POST, {
      token: f.parent.token,
      params: { id: f.scoutId },
      body: { put: [{ clientId: "d1", key: "rank:second-class#7a", kind: "log", day: "2026-10-19", amount: 45, unit: "minutes" }] },
    });
    old.entries.push({ ...old.entries[0], id: "fromold", text: "only in the copy" });

    const res = await asJson(await call(importRoute.POST, { token: f.parent.token, query: `?into=${f.scoutId}`, body: old }));
    expect(res.status).toBe(200);
    // 4b comes back (it's in the copy and missing now); 2a stays.
    expect(res.json.imported).toEqual({ steps: 1, entries: 1, photos: 0, skipped: 3 + 3 });
    expect(res.json.scout.progress).toEqual({ ...PROGRESS, "rank:tenderfoot#2a": "2026-10-16" });
    expect(res.json.scout.path).toEqual(["rank:scout", "rank:tenderfoot", "custom:knots1"]);
    const list = await entryList(f.scoutId);
    expect(list.find((e: unknown[]) => e[0] === "d1")[4]).toBe(45);
    expect(list.find((e: unknown[]) => e[0] === "fromold")[3]).toBe("only in the copy");
  });

  it("imports a phone-only Lantern trail as a new scout", async () => {
    const device = {
      format: "lantern-trail",
      version: 1,
      source: "lantern-device",
      exportedAt: new Date().toISOString(),
      scout: { id: null, name: "Emmett", path: ["rank:scout"], custom: {}, progress: { "rank:scout#1a": "2026-09-01" }, checkedBy: {} },
      entries: [],
    };
    const res = await asJson(await call(importRoute.POST, { token: f.parent.token, body: device }));
    expect(res.status).toBe(200);
    expect(res.json.scout.progress).toEqual({ "rank:scout#1a": "2026-09-01" });
    expect(res.json.scout.id).not.toBe(f.scoutId);
  });

  it("refuses a file that isn't a trail", async () => {
    const res = await asJson(await call(importRoute.POST, { token: f.parent.token, body: { hello: "world" } }));
    expect(res).toEqual({ status: 400, json: { error: "bad_file" } });
    expect((await call(importRoute.POST, { token: f.parent.token, raw: Buffer.from("PK\u0003\u0004junk") })).status).toBe(400);
  });
});
