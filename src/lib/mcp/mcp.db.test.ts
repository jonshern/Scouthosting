// End-to-end checks for the Claude connector: real OAuth routes, real
// /mcp handler, real Postgres. Runs only with
//   TEST_DATABASE_URL=postgresql://.../compass_test npm test
// Creates its own suffix-tagged orgs and users and removes only those.
//
// The browser half of sign-in (the consent page) is skipped: codes are
// issued with issueCode(), exactly what the consent POST does after the
// adult taps Allow. Everything after that goes through the routes.

import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.FLY_APP_NAME;
  delete process.env.K_SERVICE;
  process.env.MCP_PUBLIC_URL = "http://localhost:3000";
});

import { prisma } from "@/lib/db";
import { provisionOrgVault, unwrapDekWithMaster } from "@/lib/encryption";
import { encryptMemberPii } from "@/lib/members/crypto";
import { encryptScoutName } from "@/lib/journey/crypto";
import { setCatalogForTests, type Catalog } from "@/lib/mcp/catalog";
import { connectionsFor, issueCode, revokeClientForUser } from "@/lib/mcp/oauth/tokens";

import * as mcp from "@/app/mcp/route";
import * as register from "@/app/mcp/oauth/register/route";
import * as token from "@/app/mcp/oauth/token/route";
import * as revoke from "@/app/mcp/oauth/revoke/route";
import * as prm from "@/app/.well-known/oauth-protected-resource/mcp/route";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}m`;
const ORIGIN = "http://localhost:3000";
const REDIRECT = "http://127.0.0.1:43123/callback";

const catalog: Catalog = {
  ranks: [
    { key: "rank:scout", name: "Scout", kind: "rank", reqs: [{ n: "1", t: "Repeat the Scout Oath", subs: [] }, { n: "2", t: "Tie a square knot", subs: [] }] },
    { key: "rank:tenderfoot", name: "Tenderfoot", kind: "rank", reqs: [{ n: "1", t: "Pack for a campout", subs: [] }] },
  ],
  badges: [
    { key: "badge:first-aid", name: "First Aid", kind: "badge", eagle: true, reqs: [1, 2, 3].map((n) => ({ n: String(n), t: `First aid ${n}`, subs: [] })) },
  ],
};

type U = { id: string; email: string };
const f = {} as {
  parent: U;
  unverified: U;
  leaderB: U;
  youth: U;
  stranger: U;
  orgA: string;
  orgB: string;
  emmett: string;
  ben: string;
  bKid: string;
  lanternKid: string;
  strangersLantern: string;
  eventA: string;
  eventB: string;
  clientId: string;
};

const form = (p: Record<string, string>) => new URLSearchParams(p).toString();

async function post(handler: (req: NextRequest) => Promise<Response>, url: string, body: string, headers: Record<string, string>) {
  const res = await handler(new NextRequest(`${ORIGIN}${url}`, { method: "POST", headers, body }));
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

async function tokensFor(user: U, scope = "scouts:read scouts:write") {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const code = await issueCode({ clientId: f.clientId, userId: user.id, redirectUri: REDIRECT, codeChallenge: challenge, scope });
  const r = await post(token.POST, "/mcp/oauth/token", form({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: f.clientId, code_verifier: verifier }), {
    "content-type": "application/x-www-form-urlencoded",
  });
  expect(r.status).toBe(200);
  return { ...(JSON.parse(r.text) as { access_token: string; refresh_token: string; scope: string }), code, verifier };
}

let rpcId = 0;
async function rpc(accessToken: string | null, method: string, params: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-06-18",
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const r = await post(mcp.POST, "/mcp", JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }), headers);
  // A JSON body, or one SSE message for older protocol versions.
  const data = r.text.startsWith("{") ? r.text : r.text.split("\n").find((l) => l.startsWith("data: "))?.slice(6);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = data ? JSON.parse(data) : null;
  return { status: r.status, headers: r.headers, body };
}

async function tool(accessToken: string, name: string, args: Record<string, unknown> = {}) {
  const r = await rpc(accessToken, "tools/call", { name, arguments: args });
  expect(r.status).toBe(200);
  const result = r.body.result as { content: { text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> };
  return { text: result.content.map((c) => c.text).join("\n"), isError: !!result.isError, data: result.structuredContent };
}

async function makeOrg(label: string) {
  const vault = (await provisionOrgVault("test-passphrase-123")).fields;
  return prisma.org.create({
    data: {
      slug: `${label}-${S}`.toLowerCase(),
      unitType: "Troop",
      unitNumber: "100",
      displayName: `${label} ${S}`,
      charterOrg: "Test",
      city: "Test",
      state: "MN",
      scoutmasterName: "Test",
      scoutmasterEmail: `sm-${label}-${S}@example.invalid`,
      ...vault,
    },
    select: { id: true, encryptedDek: true },
  });
}

async function makeUser(label: string, emailVerified = true): Promise<U> {
  const email = `${label}-${S}@example.invalid`;
  const u = await prisma.user.create({ data: { email, displayName: `${label} ${S}`, emailVerified } });
  return { id: u.id, email };
}

describe.skipIf(!db)("Claude connector (Postgres)", () => {
  beforeAll(async () => {
    setCatalogForTests(catalog);
    f.parent = await makeUser("mparent");
    f.unverified = await makeUser("munverified", false);
    f.leaderB = await makeUser("mleaderb");
    f.youth = await makeUser("myouth");
    f.stranger = await makeUser("mstranger");

    const a = await makeOrg("mtroopa");
    const b = await makeOrg("mtroopb");
    f.orgA = a.id;
    f.orgB = b.id;
    const member = (org: typeof a, d: { firstName: string; lastName: string; email?: string; isYouth: boolean; parentIds?: string[] }) =>
      prisma.member.create({
        data: {
          orgId: org.id,
          ...encryptMemberPii({ firstName: d.firstName, lastName: d.lastName }, unwrapDekWithMaster(org), org.id),
          email: d.email ?? null,
          isYouth: d.isYouth,
          parentIds: d.parentIds ?? [],
        },
      });
    const parentRow = await member(a, { firstName: "Jo", lastName: "Shern", email: f.parent.email, isYouth: false });
    const unverifiedRow = await member(a, { firstName: "Un", lastName: "Verified", email: f.unverified.email, isYouth: false });
    f.emmett = (await member(a, { firstName: "Emmett", lastName: "Shern", isYouth: true, parentIds: [parentRow.id, unverifiedRow.id] })).id;
    f.ben = (await member(a, { firstName: "Ben", lastName: "Kim", isYouth: true })).id;
    await member(a, { firstName: "Yo", lastName: "Uth", email: f.youth.email, isYouth: true });
    f.bKid = (await member(b, { firstName: "Bea", lastName: "Other", isYouth: true })).id;

    await prisma.orgMembership.createMany({
      data: [
        { orgId: f.orgA, userId: f.parent.id, role: "parent" },
        { orgId: f.orgA, userId: f.unverified.id, role: "parent" },
        { orgId: f.orgA, userId: f.youth.id, role: "scout" },
        { orgId: f.orgB, userId: f.leaderB.id, role: "leader" },
      ],
    });
    await prisma.requirementProgress.createMany({
      data: [
        { orgId: f.orgA, memberId: f.emmett, requirementId: "rank:scout#1", status: "signed_off", signedOffAt: new Date("2026-09-01T12:00:00Z") },
        { orgId: f.orgA, memberId: f.emmett, requirementId: "rank:scout#2", status: "signed_off", signedOffAt: new Date("2026-09-02T12:00:00Z") },
        { orgId: f.orgA, memberId: f.emmett, requirementId: "badge:first-aid#1", status: "done" },
        { orgId: f.orgA, memberId: f.ben, requirementId: "badge:first-aid#1", status: "signed_off" },
      ],
    });
    const soon = new Date(Date.now() + 5 * 86_400_000);
    f.eventA = (await prisma.event.create({ data: { orgId: f.orgA, title: `Campout ${S}`, startsAt: soon } })).id;
    f.eventB = (await prisma.event.create({ data: { orgId: f.orgB, title: `Other troop ${S}`, startsAt: soon } })).id;

    // Lantern: one scout the parent follows without a troop, one a stranger follows.
    f.lanternKid = (
      await prisma.journeyScout.create({
        data: {
          ownerUserId: f.parent.id,
          encName: Buffer.from(encryptScoutName(f.parent.id, "Lila Shern")),
          path: ["rank:scout", "rank:tenderfoot"],
          progress: { create: [{ key: "rank:scout", doneOn: "2026-08-01" }] },
        },
      })
    ).id;
    f.strangersLantern = (
      await prisma.journeyScout.create({ data: { ownerUserId: f.stranger.id, encName: Buffer.from(encryptScoutName(f.stranger.id, "Secret Kid")) } })
    ).id;

    const reg = await post(register.POST, "/mcp/oauth/register", JSON.stringify({ client_name: `Test ${S}`, redirect_uris: [REDIRECT] }), {
      "content-type": "application/json",
    });
    expect(reg.status).toBe(201);
    f.clientId = JSON.parse(reg.text).client_id;
  });

  afterAll(async () => {
    setCatalogForTests(undefined);
    const users = [f.parent, f.unverified, f.leaderB, f.youth, f.stranger].filter(Boolean).map((u) => u.id);
    await prisma.org.deleteMany({ where: { id: { in: [f.orgA, f.orgB].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (f.clientId) await prisma.mcpClient.deleteMany({ where: { clientId: f.clientId } });
    await prisma.rateLimitBucket.deleteMany({ where: { OR: users.map((u) => ({ key: { startsWith: `mcp:user:${u}` } })) } });
  });

  it("challenges a request without a token, pointing at the resource metadata", async () => {
    const r = await rpc(null, "tools/list");
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`);
    const bad = await rpc("compass_mcp_at_nope", "tools/list");
    expect(bad.status).toBe(401);
    expect(bad.headers.get("www-authenticate")).toContain('error="invalid_token"');

    const meta = await prm.GET();
    expect(await meta.json()).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN] });
  });

  it("answers how is Emmett doing for his parent", async () => {
    const t = await tokensFor(f.parent);
    const list = await tool(t.access_token, "list_scouts");
    expect(list.text).toContain("Emmett S.");
    expect(list.text).toContain("Lila Shern");
    expect(list.text).not.toContain("Ben");

    const how = await tool(t.access_token, "how_is_scout_doing", { scout: "Emmett" });
    expect(how.isError).toBe(false);
    expect(how.text).toContain("Emmett's rank is Scout (since 2026-09-02)");
    expect(how.text).toContain("Toward Tenderfoot");
    expect(how.text).toContain("First Aid");
    expect(how.text).toContain(`Campout ${S}`);

    const pending = await tool(t.access_token, "pending_signoffs", { scout: "Emmett" });
    expect(pending.text).toContain("badge:first-aid#1");
  });

  it("reads a Lantern-only scout from the family's trail", async () => {
    const t = await tokensFor(f.parent);
    const how = await tool(t.access_token, "how_is_scout_doing", { scout: "Lila" });
    expect(how.text).toContain("Lila's rank is Scout (since 2026-08-01), as checked off in Lantern");
    expect(how.text).toContain("Lantern trail: 1 of 2 steps complete; next up: Tenderfoot");
    expect(how.text).toContain("isn't in a unit on Compass");
  });

  it("never shows another family's scout", async () => {
    const t = await tokensFor(f.parent);
    for (const name of ["Ben", f.ben, "Bea", f.bKid, "Secret", f.strangersLantern]) {
      const r = await tool(t.access_token, "how_is_scout_doing", { scout: name });
      expect(r.isError).toBe(true);
      expect(r.text).not.toContain("rank is");
    }
    const other = await tokensFor(f.leaderB);
    const r = await tool(other.access_token, "how_is_scout_doing", { scout: "Emmett" });
    expect(r.isError).toBe(true);
    // A leader sees their own unit's scouts, not another unit's.
    expect((await tool(other.access_token, "list_scouts")).text).toContain("Bea O.");
  });

  it("gives an unconfirmed email and a youth account nothing", async () => {
    for (const u of [f.unverified, f.youth]) {
      const t = await tokensFor(u);
      const r = await tool(t.access_token, "list_scouts");
      expect(r.text).toContain("No scouts are linked");
    }
  });

  it("only RSVPs to the adult's own unit's events, and only after confirm", async () => {
    const t = await tokensFor(f.parent);
    const outside = await tool(t.access_token, "rsvp_event", { event: f.eventB, response: "yes", confirm: true });
    expect(outside.isError).toBe(true);

    const preview = await tool(t.access_token, "rsvp_event", { event: f.eventA, response: "yes" });
    expect(preview.text).toContain("Not saved yet");
    expect(await prisma.rsvp.count({ where: { eventId: f.eventA } })).toBe(0);

    const saved = await tool(t.access_token, "rsvp_event", { event: f.eventA, response: "yes", confirm: true });
    expect(saved.text).toContain("Saved");
    expect(await prisma.rsvp.count({ where: { eventId: f.eventA, userId: f.parent.id, response: "yes" } })).toBe(1);
  });

  it("marks requirements on the troop record and on the Lantern trail, never a sign-off", async () => {
    const t = await tokensFor(f.parent);
    const signed = await tool(t.access_token, "mark_requirement", { scout: "Emmett", requirement: "rank:scout#1", status: "not_started", confirm: true });
    expect(signed.isError).toBe(true);
    expect(signed.text).toContain("already signed off");

    const preview = await tool(t.access_token, "mark_requirement", { scout: "Emmett", requirement: "badge:first-aid#2", status: "done" });
    expect(preview.text).toContain("Not saved yet");
    expect(await prisma.requirementProgress.count({ where: { memberId: f.emmett, requirementId: "badge:first-aid#2" } })).toBe(0);

    await tool(t.access_token, "mark_requirement", { scout: "Emmett", requirement: "badge:first-aid#2", status: "done", confirm: true });
    expect(await prisma.requirementProgress.findUnique({ where: { memberId_requirementId: { memberId: f.emmett, requirementId: "badge:first-aid#2" } } })).toMatchObject({
      status: "done",
      updatedById: f.parent.id,
    });

    const lantern = await tool(t.access_token, "mark_requirement", { scout: "Lila", requirement: "rank:tenderfoot#1", status: "done", confirm: true });
    expect(lantern.text).toContain("checked off in Lantern");
    expect(await prisma.journeyProgress.count({ where: { scoutId: f.lanternKid, key: "rank:tenderfoot#1" } })).toBe(1);

    const unknown = await tool(t.access_token, "mark_requirement", { scout: "Emmett", requirement: "badge:first-aid#9", status: "done", confirm: true });
    expect(unknown.isError).toBe(true);
  });

  it("keeps a read-only connection read-only", async () => {
    const t = await tokensFor(f.parent, "scouts:read");
    expect(t.scope).toBe("scouts:read");
    const r = await tool(t.access_token, "rsvp_event", { event: f.eventA, response: "no", confirm: true });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("read-only");
  });

  it("rotates refresh tokens and revokes the family on reuse or code replay", async () => {
    const t = await tokensFor(f.parent);
    const refresh = (rt: string) =>
      post(token.POST, "/mcp/oauth/token", form({ grant_type: "refresh_token", refresh_token: rt, client_id: f.clientId }), {
        "content-type": "application/x-www-form-urlencoded",
      });
    const r1 = await refresh(t.refresh_token);
    expect(r1.status).toBe(200);
    const next = JSON.parse(r1.text);
    expect((await rpc(t.access_token, "tools/list")).status).toBe(401);
    expect((await rpc(next.access_token, "tools/list")).status).toBe(200);

    // The old refresh token again: someone has a copy, so everything goes.
    expect((await refresh(t.refresh_token)).status).toBe(400);
    expect((await rpc(next.access_token, "tools/list")).status).toBe(401);

    // Replaying a used code also revokes what it minted.
    const u = await tokensFor(f.parent);
    const replay = await post(token.POST, "/mcp/oauth/token", form({ grant_type: "authorization_code", code: u.code, redirect_uri: REDIRECT, client_id: f.clientId, code_verifier: u.verifier }), {
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(replay.status).toBe(400);
    expect((await rpc(u.access_token, "tools/list")).status).toBe(401);
  });

  it("refuses a wrong PKCE verifier and revokes on request", async () => {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const code = await issueCode({ clientId: f.clientId, userId: f.parent.id, redirectUri: REDIRECT, codeChallenge: challenge, scope: "scouts:read" });
    const wrong = await post(token.POST, "/mcp/oauth/token", form({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: f.clientId, code_verifier: `${verifier}x` }), {
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(wrong.status).toBe(400);

    const t = await tokensFor(f.parent);
    const r = await post(revoke.POST, "/mcp/oauth/revoke", form({ token: t.refresh_token, client_id: f.clientId }), { "content-type": "application/x-www-form-urlencoded" });
    expect(r.status).toBe(200);
    expect((await rpc(t.access_token, "tools/list")).status).toBe(401);
  });

  it("lists and disconnects an app from the account page, only for its owner", async () => {
    const t = await tokensFor(f.leaderB);
    expect((await connectionsFor(f.leaderB.id)).map((c) => c.clientId)).toContain(f.clientId);
    expect(await revokeClientForUser(f.stranger.id, f.clientId)).toBe(0);
    expect((await rpc(t.access_token, "tools/list")).status).toBe(200);
    expect(await revokeClientForUser(f.leaderB.id, f.clientId)).toBeGreaterThan(0);
    expect((await rpc(t.access_token, "tools/list")).status).toBe(401);
    expect(await connectionsFor(f.leaderB.id)).toEqual([]);
  });
});
