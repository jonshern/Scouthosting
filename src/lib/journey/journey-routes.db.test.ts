// End-to-end checks for Lantern's /api/v1/journey routes: real
// handlers, real Postgres, real bearer tokens. Runs only with
//   TEST_DATABASE_URL=postgresql://.../compass_test npm test
// Creates its own suffix-tagged org and users and removes only those.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.FLY_APP_NAME;
  delete process.env.K_SERVICE;
});

import { prisma } from "@/lib/db";
import { issueToken } from "@/lib/auth/api-token";
import { provisionOrgVault, unwrapDekWithMaster } from "@/lib/encryption";
import { encryptMemberPii } from "@/lib/members/crypto";
import { MAX_SCOUTS_PER_OWNER } from "@/lib/journey/schema";

import * as scouts from "@/app/api/v1/journey/scouts/route";
import * as scout from "@/app/api/v1/journey/scouts/[id]/route";
import * as progress from "@/app/api/v1/journey/scouts/[id]/progress/route";
import * as troopScouts from "@/app/api/v1/journey/troop-scouts/route";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}j`;

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

type U = { id: string; token: string; email: string };
const f = {} as { parent: U; unverified: U; stranger: U; org: { id: string }; kid: string; otherKid: string };

async function makeUser(label: string, emailVerified = true): Promise<U> {
  const email = `${label}-${S}@example.invalid`;
  const user = await prisma.user.create({ data: { email, displayName: `${label} ${S}`, emailVerified } });
  const token = await issueToken(user.id, "test", prisma);
  return { id: user.id, token: token.raw, email };
}

describe.skipIf(!db)("Lantern /api/v1/journey routes (Postgres)", () => {
  beforeAll(async () => {
    f.parent = await makeUser("jparent");
    f.unverified = await makeUser("junverified", false);
    f.stranger = await makeUser("jstranger");
    const vault = (await provisionOrgVault("test-passphrase-123")).fields;
    const org = await prisma.org.create({
      data: {
        slug: `jtroop-${S}`.toLowerCase(),
        unitType: "Troop",
        unitNumber: "100",
        displayName: `Journey Troop ${S}`,
        charterOrg: "Test",
        city: "Test",
        state: "MN",
        scoutmasterName: "Test",
        scoutmasterEmail: `sm-${S}@example.invalid`,
        ...vault,
      },
      select: { id: true, encryptedDek: true },
    });
    f.org = { id: org.id };
    const dek = unwrapDekWithMaster(org);
    const member = (data: { firstName: string; lastName: string; email?: string; isYouth: boolean; parentIds?: string[] }) =>
      prisma.member.create({
        data: {
          orgId: org.id,
          ...encryptMemberPii({ firstName: data.firstName, lastName: data.lastName }, dek, org.id),
          email: data.email ?? null,
          isYouth: data.isYouth,
          parentIds: data.parentIds ?? [],
        },
      });
    // The roster lists the parent by email, in any case.
    const parentMember = await member({ firstName: "Jo", lastName: "Shern", email: f.parent.email.toUpperCase(), isYouth: false });
    const unverifiedMember = await member({ firstName: "Un", lastName: "Verified", email: f.unverified.email, isYouth: false });
    f.kid = (await member({ firstName: "Emmett", lastName: "Shern", isYouth: true, parentIds: [parentMember.id, unverifiedMember.id] })).id;
    f.otherKid = (await member({ firstName: "Other", lastName: "Kid", isYouth: true })).id;
    await prisma.requirementProgress.createMany({
      data: [
        { orgId: org.id, memberId: f.kid, requirementId: "badge:plumbing#1a", status: "signed_off", signedOffAt: new Date("2026-10-01T15:00:00Z") },
        { orgId: org.id, memberId: f.kid, requirementId: "badge:plumbing#1b", status: "done" },
      ],
    });
  });

  afterAll(async () => {
    const users = [f.parent, f.unverified, f.stranger].filter(Boolean).map((u) => u.id);
    if (f.org) await prisma.org.deleteMany({ where: { id: f.org.id } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.rateLimitBucket.deleteMany({
      where: { OR: users.map((u) => ({ key: { startsWith: `v1:user:${u}` } })) },
    });
  });

  let id = "";

  it("needs a sign-in", async () => {
    expect((await call(scouts.GET)).status).toBe(401);
  });

  it("adds a scout with the trail already on the phone, with no troop needed", async () => {
    const res = await call(scouts.POST, {
      token: f.parent.token,
      body: {
        name: " Emmett ",
        path: ["rank:scout", "rank:second-class", "badge:plumbing", "custom:a1"],
        custom: { "custom:a1": { key: "custom:a1", name: "Fix the bike", kind: "custom", reqs: [{ n: "1", t: "Patch it", subs: [] }] } },
        progress: { "rank:scout": true, "rank:second-class#1a": "2026-10-11", "custom:a1#1": true },
      },
    });
    expect(res.status).toBe(201);
    id = res.json.scout.id;
    expect(res.json.scout).toMatchObject({
      name: "Emmett",
      linked: false,
      path: ["rank:scout", "rank:second-class", "badge:plumbing", "custom:a1"],
      progress: { "rank:scout": true, "rank:second-class#1a": "2026-10-11", "custom:a1#1": true },
      troop: null,
    });
    // The name is encrypted at rest.
    const row = await prisma.journeyScout.findUniqueOrThrow({ where: { id } });
    expect(Buffer.from(row.encName).toString("utf8")).not.toContain("Emmett");
  });

  it("lists only the caller's scouts and hides others' with 404", async () => {
    const mine = await call(scouts.GET, { token: f.parent.token });
    expect(mine.json.scouts.map((s: { name: string }) => s.name)).toEqual(["Emmett"]);
    expect((await call(scouts.GET, { token: f.stranger.token })).json.scouts).toEqual([]);
    expect((await call(scout.GET, { token: f.stranger.token, params: { id } })).status).toBe(404);
    const write = await call(progress.POST, {
      token: f.stranger.token,
      params: { id },
      body: { changes: [{ key: "rank:tenderfoot", done: true }] },
    });
    expect(write.status).toBe(404);
    expect((await call(scout.DELETE, { token: f.stranger.token, method: "DELETE", params: { id } })).status).toBe(404);
  });

  it("checks and unchecks steps, last change per key wins", async () => {
    const res = await call(progress.POST, {
      token: f.parent.token,
      params: { id },
      body: {
        changes: [
          { key: "rank:second-class#1b", done: true, on: "2026-10-12" },
          { key: "rank:second-class#1a", done: false },
          { key: "badge:plumbing#2a", done: true },
          { key: "badge:plumbing#2a", done: false },
          { key: "rank:scout", done: true },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.scout.progress).toEqual({ "custom:a1#1": true, "rank:scout": true, "rank:second-class#1b": "2026-10-12" });
  });

  it("refuses bad keys and dates", async () => {
    const bad = await call(progress.POST, {
      token: f.parent.token,
      params: { id },
      body: { changes: [{ key: "rank:Scout", done: true }] },
    });
    expect(bad.status).toBe(400);
    const date = await call(progress.POST, {
      token: f.parent.token,
      params: { id },
      body: { changes: [{ key: "rank:scout", done: true, on: "Oct 11" }] },
    });
    expect(date.status).toBe(400);
  });

  it("renames and reorders", async () => {
    const res = await call(scout.PATCH, {
      token: f.parent.token,
      method: "PATCH",
      params: { id },
      body: { name: "Emmett S", path: ["badge:plumbing", "rank:scout"] },
    });
    expect(res.json.scout).toMatchObject({ name: "Emmett S", path: ["badge:plumbing", "rank:scout"] });
  });

  it("offers the troop scouts this parent is listed for, once the email is confirmed", async () => {
    const res = await call(troopScouts.GET, { token: f.parent.token });
    expect(res.json.scouts).toEqual([
      { memberId: f.kid, firstName: "Emmett", lastInitial: "S", orgName: `Journey Troop ${S}`, orgSlug: `jtroop-${S}`.toLowerCase() },
    ]);
    expect((await call(troopScouts.GET, { token: f.unverified.token })).json.scouts).toEqual([]);
    expect((await call(troopScouts.GET, { token: f.stranger.token })).json.scouts).toEqual([]);
  });

  it("links only the caller's own troop scout, and then shows the troop's sign-offs", async () => {
    const other = await call(scout.PATCH, { token: f.parent.token, method: "PATCH", params: { id }, body: { memberId: f.otherKid } });
    expect(other.status).toBe(403);
    const linked = await call(scout.PATCH, { token: f.parent.token, method: "PATCH", params: { id }, body: { memberId: f.kid } });
    expect(linked.status).toBe(200);
    expect(linked.json.scout.linked).toBe(true);
    expect(linked.json.scout.troop).toMatchObject({ memberId: f.kid, signedOff: { "badge:plumbing#1a": "2026-10-01" } });
    // Done-but-not-signed-off troop rows aren't sign-offs.
    expect(linked.json.scout.troop.signedOff["badge:plumbing#1b"]).toBeUndefined();
  });

  it("stops showing the troop once the roster no longer lists the parent", async () => {
    await prisma.member.update({ where: { id: f.kid }, data: { parentIds: [] } });
    const res = await call(scout.GET, { token: f.parent.token, params: { id } });
    expect(res.json.scout.troop).toBeNull();
  });

  it("caps scouts per account", async () => {
    for (let i = 0; i < MAX_SCOUTS_PER_OWNER; i++) {
      expect((await call(scouts.POST, { token: f.stranger.token, body: { name: `Kid ${i}` } })).status).toBe(201);
    }
    const over = await call(scouts.POST, { token: f.stranger.token, body: { name: "One too many" } });
    expect(over.status).toBe(409);
    expect(over.json).toEqual({ error: "too_many_scouts" });
  });

  it("deletes a scout and its trail", async () => {
    expect((await call(scout.DELETE, { token: f.parent.token, method: "DELETE", params: { id } })).status).toBe(200);
    expect(await prisma.journeyProgress.count({ where: { scoutId: id } })).toBe(0);
    expect((await call(scout.GET, { token: f.parent.token, params: { id } })).status).toBe(404);
  });
});
