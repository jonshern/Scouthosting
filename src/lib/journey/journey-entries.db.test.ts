// End-to-end checks for Lantern's requirement entries (logs, notes,
// photos, "ready"): real handlers, real Postgres, real bearer tokens.
// Runs only with TEST_DATABASE_URL set. Creates its own suffix-tagged
// users and removes only those.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.FLY_APP_NAME;
  delete process.env.K_SERVICE;
  process.env.LOCAL_UPLOADS_DIR ??= `/tmp/compass-journey-entries-${process.pid}`;
});

import { prisma } from "@/lib/db";
import { issueToken } from "@/lib/auth/api-token";

import * as scouts from "@/app/api/v1/journey/scouts/route";
import * as entries from "@/app/api/v1/journey/scouts/[id]/entries/route";
import * as exportCsv from "@/app/api/v1/journey/scouts/[id]/entries/export/route";
import * as photo from "@/app/api/v1/journey/scouts/[id]/entries/photo/route";
import * as photoGet from "@/app/api/v1/journey/scouts/[id]/entries/[entryId]/photo/route";
import * as pairCode from "@/app/api/v1/journey/scouts/[id]/pair-code/route";
import * as pair from "@/app/api/v1/journey/pair/route";
import * as myEntries from "@/app/api/v1/journey/scout/entries/route";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}e`;

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(
  handler: unknown,
  opts: { token?: string; method?: string; params?: Record<string, string>; query?: string; body?: unknown; form?: FormData } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: string | FormData | undefined = opts.form;
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
  return res;
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

// A 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

describe.skipIf(!db)("Lantern /api/v1/journey entries (Postgres)", () => {
  beforeAll(async () => {
    f.parent = await makeUser("eparent");
    f.stranger = await makeUser("estranger");
    const res = await asJson(await call(scouts.POST, { token: f.parent.token, body: { name: "Emmett" } }));
    f.scoutId = res.json.scout.id;
  });

  afterAll(async () => {
    const users = [f.parent, f.stranger].filter(Boolean).map((u) => u.id);
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.rateLimitBucket.deleteMany({
      where: { OR: users.map((u) => ({ key: { startsWith: `v1:user:${u}` } })) },
    });
  });

  const params = () => ({ id: f.scoutId });

  it("needs a sign-in, and someone else's scout is a 404", async () => {
    expect((await call(entries.GET, { params: params() })).status).toBe(401);
    expect((await call(entries.GET, { token: f.stranger.token, params: params() })).status).toBe(404);
    const put = { put: [{ clientId: "x1", key: "rank:second-class#7a", kind: "note", text: "hi" }] };
    expect((await call(entries.POST, { token: f.stranger.token, params: params(), body: put })).status).toBe(404);
  });

  it("logs exercise days and a note, encrypted at rest, attributed to the parent", async () => {
    const res = await asJson(
      await call(entries.POST, {
        token: f.parent.token,
        params: params(),
        body: {
          put: [
            { clientId: "d1", key: "rank:second-class#7a", kind: "log", day: "2026-10-19", amount: 30, unit: "minutes", text: "Bike" },
            { clientId: "d2", key: "rank:second-class#7a", kind: "log", day: "2026-10-20", amount: 45, unit: "minutes" },
            { clientId: "n1", key: "badge:camping#9a", kind: "note", text: "=HYPERLINK(\"x\") Two nights at Portage Lake" },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.json.entries).toHaveLength(3);
    expect(res.json.entries[0]).toMatchObject({ id: "d1", amount: 30, unit: "minutes", text: "Bike", by: "parent", photo: false });

    const row = await prisma.journeyEntry.findFirstOrThrow({ where: { scoutId: f.scoutId, clientId: "n1" } });
    expect(Buffer.from(row.encText!).toString("utf8")).not.toContain("Portage");
    expect(row.byUserId).toBe(f.parent.id);
  });

  it("filters by item or step", async () => {
    const item = await asJson(await call(entries.GET, { token: f.parent.token, params: params(), query: "?key=rank:second-class" }));
    expect(item.json.entries.map((e: { id: string }) => e.id)).toEqual(["d1", "d2"]);
    const step = await asJson(await call(entries.GET, { token: f.parent.token, params: params(), query: "?key=badge:camping%239a" }));
    expect(step.json.entries.map((e: { id: string }) => e.id)).toEqual(["n1"]);
  });

  it("replaces by clientId, removes, and a retried batch changes nothing", async () => {
    const batch = {
      put: [{ clientId: "d2", key: "rank:second-class#7a", kind: "log", day: "2026-10-20", amount: 50, unit: "minutes" }],
      remove: ["d1", "never-existed"],
    };
    const once = await asJson(await call(entries.POST, { token: f.parent.token, params: params(), body: batch }));
    const twice = await asJson(await call(entries.POST, { token: f.parent.token, params: params(), body: batch }));
    expect(once.status).toBe(200);
    const strip = (es: { updatedAt?: string }[]) => es.map((e) => ({ ...e, updatedAt: undefined }));
    expect(strip(twice.json.entries)).toEqual(strip(once.json.entries));
    expect(twice.json.entries.map((e: { id: string; amount: number }) => [e.id, e.amount])).toEqual([
      ["d2", 50],
      ["n1", null],
    ]);
  });

  it("rejects bad input", async () => {
    const bad = [
      { put: [{ clientId: "b1", key: "rank:second-class#7a", kind: "log" }] }, // log with no amount
      { put: [{ clientId: "b 1", key: "rank:second-class#7a", kind: "note" }] },
      { put: [{ clientId: "b1", key: "nope", kind: "note" }] },
      { put: [{ clientId: "b1", key: "rank:scout", kind: "photo" }] },
      { put: [], remove: [] },
    ];
    for (const body of bad) {
      expect((await call(entries.POST, { token: f.parent.token, params: params(), body })).status).toBe(400);
    }
  });

  it("stores a proof photo encrypted and serves it back to the owner only", async () => {
    const form = new FormData();
    form.set("photo", new Blob([PNG], { type: "image/png" }), "proof.png");
    form.set("clientId", "p1");
    form.set("key", "badge:woodwork#5");
    form.set("text", "My birdhouse");
    const res = await asJson(await call(photo.POST, { token: f.parent.token, params: params(), form }));
    expect(res.status).toBe(200);
    expect(res.json.entry).toMatchObject({ id: "p1", kind: "photo", photo: true, text: "My birdhouse" });

    const got = await call(photoGet.GET, { token: f.parent.token, params: { id: f.scoutId, entryId: "p1" } });
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await got.arrayBuffer()).equals(PNG)).toBe(true);
    expect((await call(photoGet.GET, { token: f.stranger.token, params: { id: f.scoutId, entryId: "p1" } })).status).toBe(404);

    const notImage = new FormData();
    notImage.set("photo", new Blob([Buffer.from("hello")], { type: "image/png" }), "x.png");
    notImage.set("clientId", "p2");
    notImage.set("key", "badge:woodwork#5");
    expect((await call(photo.POST, { token: f.parent.token, params: params(), form: notImage })).status).toBe(415);

    // Removing the entry removes the photo.
    await call(entries.POST, { token: f.parent.token, params: params(), body: { remove: ["p1"] } });
    expect((await call(photoGet.GET, { token: f.parent.token, params: { id: f.scoutId, entryId: "p1" } })).status).toBe(404);
  });

  it("exports a CSV that a spreadsheet won't run as formulas", async () => {
    const res = await call(exportCsv.GET, { token: f.parent.token, params: params() });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("emmett-log.csv");
    const csv = await res.text();
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Scout,Requirement,Date,Type,Amount,Unit,Note,Photo,Logged by");
    expect(lines).toContain("Emmett,rank:second-class#7a,2026-10-20,log,50,minutes,,,parent");
    expect(csv).toContain(`"'=HYPERLINK(""x"") Two nights at Portage Lake"`);
  });

  it("the scout's own device logs too, recorded as by the scout", async () => {
    const code = (await asJson(await call(pairCode.POST, { token: f.parent.token, method: "POST", params: params() }))).json.code;
    const token = (await asJson(await call(pair.POST, { body: { code } }))).json.token as string;
    expect((await call(myEntries.GET, {})).status).toBe(401);
    const res = await asJson(
      await call(myEntries.POST, {
        token,
        body: { put: [{ clientId: "s1", key: "rank:second-class#7a", kind: "log", day: "2026-10-21", amount: 30, unit: "minutes" }] },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.json.entries.find((e: { id: string }) => e.id === "s1")).toMatchObject({ by: "scout" });
    // The parent sees it.
    const parent = await asJson(await call(entries.GET, { token: f.parent.token, params: params(), query: "?key=rank:second-class%237a" }));
    expect(parent.json.entries.map((e: { id: string; by: string }) => [e.id, e.by])).toEqual([
      ["d2", "parent"],
      ["s1", "scout"],
    ]);

    // It can't rewrite or remove what the grown-up wrote.
    const edit = { put: [{ clientId: "d2", key: "rank:second-class#7a", kind: "note", text: "changed" }] };
    expect((await call(myEntries.POST, { token, body: edit })).status).toBe(403);
    await call(myEntries.POST, { token, body: { put: [], remove: ["d2", "s1"] } });
    const after = await asJson(await call(entries.GET, { token: f.parent.token, params: params(), query: "?key=rank:second-class%237a" }));
    expect(after.json.entries.map((e: { id: string }) => e.id)).toEqual(["d2"]);
  });

  it("goes away with the scout", async () => {
    await prisma.journeyScout.delete({ where: { id: f.scoutId } });
    expect(await prisma.journeyEntry.count({ where: { scoutId: f.scoutId } })).toBe(0);
  });
});
