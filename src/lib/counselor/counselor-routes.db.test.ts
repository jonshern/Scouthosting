// End-to-end checks for the counselor /api/v1 routes (Waypoint):
// real handlers, real Postgres, real bearer tokens. Runs only with
//   TEST_DATABASE_URL=postgresql://.../compass_test npm test
// Creates its own suffix-tagged orgs and users and removes only those.

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

import * as progress from "@/app/api/v1/scouts/[id]/progress/route";
import * as badges from "@/app/api/v1/me/counselor-badges/route";
import * as meetings from "@/app/api/v1/counselor/meetings/route";
import * as roster from "@/app/api/v1/orgs/[slug]/scouts/route";
import * as assignments from "@/app/api/v1/orgs/[slug]/counselor-assignments/route";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}c`;

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
const f = {} as {
  org: { id: string; slug: string };
  otherOrg: { id: string; slug: string };
  admin: U;
  leader: U;
  counselor: U;
  otherCounselor: U;
  parent: U;
  scout: U;
  outsider: U;
  scoutA: string;
  scoutB: string;
  parentMember: string;
  otherScout: string;
};

async function makeUser(label: string): Promise<U> {
  const email = `${label}-${S}@example.invalid`;
  const user = await prisma.user.create({ data: { email, displayName: `${label} ${S}` } });
  const token = await issueToken(user.id, "test", prisma);
  return { id: user.id, token: token.raw, email };
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
      scoutmasterEmail: `sm-${S}@example.invalid`,
      ...vault,
    },
    select: { id: true, slug: true, encryptedDek: true },
  });
}

async function makeMember(
  org: { id: string; encryptedDek: Uint8Array | null },
  data: { firstName: string; lastName: string; phone?: string; email?: string; isYouth: boolean; parentIds?: string[] },
) {
  const dek = unwrapDekWithMaster(org);
  const m = await prisma.member.create({
    data: {
      orgId: org.id,
      ...encryptMemberPii({ firstName: data.firstName, lastName: data.lastName, phone: data.phone }, dek, org.id),
      email: data.email ?? null,
      isYouth: data.isYouth,
      parentIds: data.parentIds ?? [],
    },
  });
  return m.id;
}

const put = (token: string, id: string, items: unknown[]) =>
  call(progress.PUT, { token, method: "PUT", params: { id }, body: { items } });

describe.skipIf(!db)("counselor /api/v1 routes (Postgres)", () => {
  beforeAll(async () => {
    const org = await makeOrg("cnsl");
    const otherOrg = await makeOrg("cnslother");
    f.org = { id: org.id, slug: org.slug };
    f.otherOrg = { id: otherOrg.id, slug: otherOrg.slug };
    for (const k of ["admin", "leader", "counselor", "otherCounselor", "parent", "scout", "outsider"] as const) {
      f[k] = await makeUser(k.toLowerCase());
    }
    await prisma.orgMembership.createMany({
      data: [
        { orgId: org.id, userId: f.admin.id, role: "admin" },
        { orgId: org.id, userId: f.leader.id, role: "leader" },
        { orgId: org.id, userId: f.counselor.id, role: "parent" },
        { orgId: org.id, userId: f.otherCounselor.id, role: "parent" },
        { orgId: org.id, userId: f.parent.id, role: "parent" },
        { orgId: org.id, userId: f.scout.id, role: "scout" },
        { orgId: otherOrg.id, userId: f.outsider.id, role: "admin" },
        // The counselor also belongs to the other org, as a plain member.
        { orgId: otherOrg.id, userId: f.counselor.id, role: "parent" },
      ],
    });
    f.parentMember = await makeMember(org, {
      firstName: "Pat",
      lastName: "Zimmerman",
      phone: "555-0100",
      email: f.parent.email,
      isYouth: false,
    });
    f.scoutA = await makeMember(org, {
      firstName: "Alex",
      lastName: "Zimmerman",
      email: f.scout.email,
      isYouth: true,
      parentIds: [f.parentMember],
    });
    f.scoutB = await makeMember(org, { firstName: "Bo", lastName: "Quill", isYouth: true });
    f.otherScout = await makeMember(otherOrg, { firstName: "Cy", lastName: "Other", isYouth: true });
  });

  afterAll(async () => {
    // Let fire-and-forget audit writes land before the orgs go.
    await new Promise((r) => setTimeout(r, 300));
    const users = [f.admin, f.leader, f.counselor, f.otherCounselor, f.parent, f.scout, f.outsider]
      .filter(Boolean)
      .map((u) => u.id);
    await prisma.org.deleteMany({ where: { id: { in: [f.org?.id, f.otherOrg?.id].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.rateLimitBucket.deleteMany({
      where: { OR: users.map((u) => ({ key: { startsWith: `v1:user:${u}` } })) },
    });
  });

  describe("counselor assignments", () => {
    const body = () => ({ counselorUserId: f.counselor.id, scoutId: f.scoutA, badgeSlug: "plumbing" });

    it("only admins and leaders manage them; other orgs get 404", async () => {
      const asCounselor = await call(assignments.POST, { token: f.counselor.token, params: { slug: f.org.slug }, body: body() });
      expect(asCounselor.status).toBe(403);
      expect(asCounselor.json).toEqual({ error: "forbidden", reason: "role" });
      const asOutsider = await call(assignments.POST, { token: f.outsider.token, params: { slug: f.org.slug }, body: body() });
      expect(asOutsider.status).toBe(404);
      expect((await call(assignments.GET, { token: f.outsider.token, params: { slug: f.org.slug } })).status).toBe(404);
    });

    it("refuse scouts from another org, youth counselors and non-members", async () => {
      const p = { slug: f.org.slug };
      const cross = await call(assignments.POST, { token: f.admin.token, params: p, body: { ...body(), scoutId: f.otherScout } });
      expect(cross.json).toEqual({ error: "scout_not_found" });
      expect(cross.status).toBe(404);
      const youth = await call(assignments.POST, { token: f.admin.token, params: p, body: { ...body(), counselorUserId: f.scout.id } });
      expect(youth.json).toEqual({ error: "counselor_not_adult" });
      const stranger = await call(assignments.POST, {
        token: f.admin.token,
        params: p,
        body: { ...body(), counselorUserId: f.outsider.id },
      });
      expect(stranger.json).toEqual({ error: "counselor_not_found" });
      const slug = await call(assignments.POST, { token: f.admin.token, params: p, body: { ...body(), badgeSlug: "First Aid" } });
      expect(slug.status).toBe(400);
      expect(slug.json.error).toBe("invalid_badge_slug");
    });

    it("create is idempotent, list shows first name and last initial only", async () => {
      const first = await call(assignments.POST, { token: f.admin.token, params: { slug: f.org.slug }, body: body() });
      expect(first.status).toBe(201);
      expect(first.json.assignment).toMatchObject({ counselorUserId: f.counselor.id, scoutId: f.scoutA, badgeSlug: "plumbing" });
      const again = await call(assignments.POST, { token: f.leader.token, params: { slug: f.org.id }, body: body() });
      expect(again.status).toBe(200);
      expect(again.json.assignment.id).toBe(first.json.assignment.id);

      const list = await call(assignments.GET, { token: f.leader.token, params: { slug: f.org.slug } });
      expect(list.status).toBe(200);
      const mine = list.json.assignments.find((a: { id: string }) => a.id === first.json.assignment.id);
      expect(mine.scout).toEqual({ id: f.scoutA, firstName: "Alex", lastInitial: "Z" });
      expect(list.text).not.toContain("Zimmerman");
    });

    it("delete by id or by key, scoped to the org", async () => {
      const made = await call(assignments.POST, {
        token: f.admin.token,
        params: { slug: f.org.slug },
        body: { counselorUserId: f.otherCounselor.id, scoutId: f.scoutB, badgeSlug: "cooking" },
      });
      const id = made.json.assignment.id;
      const wrongOrg = await call(assignments.DELETE, {
        token: f.outsider.token,
        method: "DELETE",
        params: { slug: f.otherOrg.slug },
        query: `?id=${id}`,
      });
      expect(wrongOrg.status).toBe(404);
      const byKey = await call(assignments.DELETE, {
        token: f.admin.token,
        method: "DELETE",
        params: { slug: f.org.slug },
        query: `?counselorUserId=${f.otherCounselor.id}&scoutId=${f.scoutB}&badgeSlug=cooking`,
      });
      expect(byKey.json).toEqual({ ok: true });
      const gone = await call(assignments.DELETE, {
        token: f.admin.token,
        method: "DELETE",
        params: { slug: f.org.slug },
        query: `?id=${id}`,
      });
      expect(gone.status).toBe(404);
    });
  });

  describe("me/counselor-badges", () => {
    it("starts empty, replaces the list, dedupes and sorts", async () => {
      expect((await call(badges.GET, { token: f.counselor.token })).json).toEqual({ badges: [] });
      const r = await call(badges.PUT, {
        token: f.counselor.token,
        method: "PUT",
        body: { badges: ["plumbing", "cooking", "plumbing"] },
      });
      expect(r.json).toEqual({ badges: ["cooking", "plumbing"] });
      await call(badges.PUT, { token: f.counselor.token, method: "PUT", body: { badges: ["plumbing"] } });
      expect((await call(badges.GET, { token: f.counselor.token })).json).toEqual({ badges: ["plumbing"] });
      // Another user's list is separate.
      expect((await call(badges.GET, { token: f.otherCounselor.token })).json).toEqual({ badges: [] });
    });

    it("rejects bad slugs and youth users", async () => {
      const bad = await call(badges.PUT, { token: f.counselor.token, method: "PUT", body: { badges: ["First Aid"] } });
      expect(bad.status).toBe(400);
      expect(bad.json.error).toBe("invalid_badge_slug");
      const youth = await call(badges.PUT, { token: f.scout.token, method: "PUT", body: { badges: ["plumbing"] } });
      expect(youth.json).toEqual({ error: "forbidden", reason: "youth" });
      expect((await call(badges.GET, {})).status).toBe(401);
    });
  });

  describe("roster", () => {
    it("a counselor sees only assigned scouts, minimal fields, parents included", async () => {
      const r = await call(roster.GET, { token: f.counselor.token, params: { slug: f.org.slug } });
      expect(r.status).toBe(200);
      expect(r.json.scouts).toEqual([
        {
          id: f.scoutA,
          firstName: "Alex",
          lastInitial: "Z",
          assignedBadges: ["plumbing"],
          parentContacts: [{ name: "Pat Zimmerman", email: f.parent.email, phone: "555-0100" }],
        },
      ]);
      // The scout's own email and full surname never leave the server.
      expect(r.text).not.toContain(f.scout.email);
      expect(r.text).not.toMatch(/Alex Zimmerman/);
    });

    it("an unassigned counselor sees nobody; leaders see every scout", async () => {
      expect((await call(roster.GET, { token: f.otherCounselor.token, params: { slug: f.org.slug } })).json).toEqual({ scouts: [] });
      const lead = await call(roster.GET, { token: f.leader.token, params: { slug: f.org.slug } });
      const ids = lead.json.scouts.map((s: { id: string }) => s.id);
      expect(ids).toEqual(expect.arrayContaining([f.scoutA, f.scoutB]));
      expect(ids).not.toContain(f.otherScout);
      expect(ids).not.toContain(f.parentMember);
    });

    it("other orgs get 404", async () => {
      expect((await call(roster.GET, { token: f.outsider.token, params: { slug: f.org.slug } })).status).toBe(404);
      expect((await call(roster.GET, { token: f.counselor.token, params: { slug: "no-such-org-x" } })).status).toBe(404);
      // A member elsewhere sees nothing of this org's scouts there.
      expect((await call(roster.GET, { token: f.counselor.token, params: { slug: f.otherOrg.slug } })).json).toEqual({ scouts: [] });
    });
  });

  describe("requirement progress", () => {
    it("the assigned counselor signs off their badge; the server records who and when", async () => {
      const r = await put(f.counselor.token, f.scoutA, [{ requirementId: "badge:plumbing#6b", status: "signed_off", note: "Fixed the sink" }]);
      expect(r.status).toBe(200);
      const item = r.json.items["badge:plumbing#6b"];
      expect(item).toMatchObject({ status: "signed_off", note: "Fixed the sink", signedOffBy: f.counselor.id });
      expect(Date.parse(item.signedOffAt)).toBeGreaterThan(Date.now() - 60_000);
      expect(r.json.scout).toEqual({ id: f.scoutA, firstName: "Alex", lastInitial: "Z" });
    });

    it("refuses counselors off their badge and unassigned counselors", async () => {
      const off = await put(f.counselor.token, f.scoutA, [{ requirementId: "badge:cooking#1", status: "in_progress" }]);
      expect(off.status).toBe(403);
      expect(off.json).toEqual({ error: "forbidden", reason: "not_assigned", requirementId: "badge:cooking#1" });
      const other = await put(f.otherCounselor.token, f.scoutA, [{ requirementId: "badge:plumbing#1", status: "signed_off" }]);
      expect(other.status).toBe(403);
      expect((await call(progress.GET, { token: f.otherCounselor.token, params: { id: f.scoutA } })).status).toBe(403);
    });

    it("family track progress but cannot sign off or undo a sign-off", async () => {
      const undo = await put(f.parent.token, f.scoutA, [{ requirementId: "badge:plumbing#6b", status: "done" }]);
      expect(undo.json).toEqual({ error: "forbidden", reason: "sign_off_not_allowed", requirementId: "badge:plumbing#6b" });
      const sign = await put(f.scout.token, f.scoutA, [{ requirementId: "badge:plumbing#2", status: "signed_off" }]);
      expect(sign.json.reason).toBe("sign_off_not_allowed");
      const ok = await put(f.scout.token, f.scoutA, [{ requirementId: "rank:tenderfoot#1", status: "done" }]);
      expect(ok.status).toBe(200);
      expect(ok.json.items["rank:tenderfoot#1"]).toMatchObject({ status: "done", signedOffBy: null, signedOffAt: null });
    });

    it("is all-or-nothing", async () => {
      const r = await put(f.parent.token, f.scoutA, [
        { requirementId: "rank:tenderfoot#2", status: "in_progress" },
        { requirementId: "rank:tenderfoot#3", status: "signed_off" },
      ]);
      expect(r.status).toBe(403);
      const row = await prisma.requirementProgress.findUnique({
        where: { memberId_requirementId: { memberId: f.scoutA, requirementId: "rank:tenderfoot#2" } },
      });
      expect(row).toBeNull();
    });

    it("counselors read only their badges; family and leaders read everything", async () => {
      const c = await call(progress.GET, { token: f.counselor.token, params: { id: f.scoutA } });
      expect(Object.keys(c.json.items)).toEqual(["badge:plumbing#6b"]);
      const p = await call(progress.GET, { token: f.parent.token, params: { id: f.scoutA } });
      expect(Object.keys(p.json.items).sort()).toEqual(["badge:plumbing#6b", "rank:tenderfoot#1"]);
      const l = await call(progress.GET, { token: f.leader.token, params: { id: f.scoutA } });
      expect(Object.keys(l.json.items).length).toBe(2);
    });

    it("leaders sign off ranks; re-signing keeps the original signer", async () => {
      const r = await put(f.admin.token, f.scoutA, [
        { requirementId: "rank:tenderfoot#1", status: "signed_off" },
        { requirementId: "badge:plumbing#6b", status: "signed_off" },
      ]);
      expect(r.status).toBe(200);
      expect(r.json.items["rank:tenderfoot#1"].signedOffBy).toBe(f.admin.id);
      expect(r.json.items["badge:plumbing#6b"].signedOffBy).toBe(f.counselor.id);
    });

    it("validates ids and statuses", async () => {
      const bad = await put(f.admin.token, f.scoutA, [{ requirementId: "plumbing-6b", status: "done" }]);
      expect(bad.status).toBe(400);
      expect(bad.json.error).toBe("invalid_requirement_id");
      const st = await put(f.admin.token, f.scoutA, [{ requirementId: "badge:plumbing#1", status: "approved" }]);
      expect(st.json.error).toBe("invalid_status");
    });

    it("hides other orgs' scouts and non-scouts (404)", async () => {
      expect((await call(progress.GET, { token: f.outsider.token, params: { id: f.scoutA } })).status).toBe(404);
      expect((await call(progress.GET, { token: f.otherCounselor.token, params: { id: f.otherScout } })).status).toBe(404);
      // A member of that org who isn't related to the scout gets 403.
      expect((await call(progress.GET, { token: f.counselor.token, params: { id: f.otherScout } })).status).toBe(403);
      expect((await call(progress.GET, { token: f.admin.token, params: { id: f.parentMember } })).status).toBe(404);
      expect((await put(f.outsider.token, f.scoutA, [{ requirementId: "badge:plumbing#1", status: "done" }])).status).toBe(404);
    });

    it("keeps an append-only history and audits sign-offs", async () => {
      const events = await prisma.requirementProgressEvent.findMany({
        where: { memberId: f.scoutA },
        orderBy: { createdAt: "asc" },
      });
      expect(events.map((e) => [e.requirementId, e.fromStatus, e.toStatus, e.actorUserId])).toEqual([
        ["badge:plumbing#6b", null, "signed_off", f.counselor.id],
        ["rank:tenderfoot#1", null, "done", f.scout.id],
        ["rank:tenderfoot#1", "done", "signed_off", f.admin.id],
      ]);
      const audits = await prisma.auditLog.findMany({
        where: { orgId: f.org.id, entityType: "RequirementProgress" },
        orderBy: { createdAt: "asc" },
      });
      expect(audits.map((a) => [a.action, a.userId])).toEqual([
        ["sign_off", f.counselor.id],
        ["sign_off", f.admin.id],
      ]);

      const undo = await put(f.counselor.token, f.scoutA, [{ requirementId: "badge:plumbing#6b", status: "in_progress" }]);
      expect(undo.json.items["badge:plumbing#6b"]).toMatchObject({ status: "in_progress", signedOffBy: null });
      expect(
        await prisma.auditLog.count({ where: { orgId: f.org.id, entityType: "RequirementProgress", action: "undo_sign_off" } }),
      ).toBe(1);
      expect(await prisma.requirementProgressEvent.count({ where: { memberId: f.scoutA } })).toBe(4);
    });
  });

  describe("counselor meetings", () => {
    const meeting = (over: Record<string, unknown> = {}) => ({
      org: f.org.slug,
      badgeSlug: "plumbing",
      scoutIds: [f.scoutA],
      startsAt: "2026-11-01T18:00:00Z",
      endsAt: "2026-11-01T19:00:00Z",
      place: "Library room B",
      ...over,
    });

    it("an assigned counselor creates one; each scout's parents are copied", async () => {
      const r = await call(meetings.POST, { token: f.counselor.token, body: meeting({ notes: "Bring a wrench" }) });
      expect(r.status).toBe(201);
      expect(r.json.meeting).toMatchObject({
        orgSlug: f.org.slug,
        badgeSlug: "plumbing",
        place: "Library room B",
        notes: "Bring a wrench",
        scouts: [{ id: f.scoutA, firstName: "Alex", lastInitial: "Z" }],
        notify: [{ kind: "parent", scoutId: f.scoutA, name: "Pat Zimmerman", email: f.parent.email, phone: "555-0100" }],
      });
      expect(r.text).not.toContain(f.scout.email);
    });

    it("refuses a meeting with nobody to notify, and accepts another adult", async () => {
      await call(assignments.POST, {
        token: f.admin.token,
        params: { slug: f.org.slug },
        body: { counselorUserId: f.counselor.id, scoutId: f.scoutB, badgeSlug: "plumbing" },
      });
      const none = await call(meetings.POST, { token: f.counselor.token, body: meeting({ scoutIds: [f.scoutB] }) });
      expect(none.status).toBe(400);
      expect(none.json).toEqual({ error: "no_adult_notified", scoutId: f.scoutB });
      // Mixed: A has a parent, B has none and no other adult is named.
      const mixed = await call(meetings.POST, { token: f.counselor.token, body: meeting({ scoutIds: [f.scoutA, f.scoutB] }) });
      expect(mixed.status).toBe(400);
      expect(mixed.json).toEqual({ error: "no_adult_notified", scoutId: f.scoutB });
      const youth = await call(meetings.POST, {
        token: f.counselor.token,
        body: meeting({ scoutIds: [f.scoutB], notifyAdultUserIds: [f.scout.id] }),
      });
      expect(youth.json).toEqual({ error: "invalid_notify_adult", userId: f.scout.id });
      const self = await call(meetings.POST, {
        token: f.counselor.token,
        body: meeting({ scoutIds: [f.scoutB], notifyAdultUserIds: [f.counselor.id] }),
      });
      expect(self.json.error).toBe("invalid_notify_adult");
      const ok = await call(meetings.POST, {
        token: f.counselor.token,
        body: meeting({ scoutIds: [f.scoutB], notifyAdultUserIds: [f.leader.id], startsAt: "2026-11-02T18:00:00Z", endsAt: null }),
      });
      expect(ok.status).toBe(201);
      expect(ok.json.meeting.notify).toEqual([{ kind: "adult", userId: f.leader.id, name: `leader ${S}`, email: f.leader.email }]);
    });

    it("refuses unassigned counselors, other orgs' scouts and other orgs", async () => {
      const other = await call(meetings.POST, { token: f.otherCounselor.token, body: meeting() });
      expect(other.json).toEqual({ error: "forbidden", reason: "not_assigned", scoutId: f.scoutA });
      const wrongBadge = await call(meetings.POST, { token: f.counselor.token, body: meeting({ badgeSlug: "cooking" }) });
      expect(wrongBadge.status).toBe(403);
      const crossScout = await call(meetings.POST, { token: f.counselor.token, body: meeting({ scoutIds: [f.otherScout] }) });
      expect(crossScout.json).toEqual({ error: "scout_not_found" });
      const crossOrg = await call(meetings.POST, { token: f.outsider.token, body: meeting() });
      expect(crossOrg.status).toBe(404);
      const range = await call(meetings.POST, { token: f.counselor.token, body: meeting({ endsAt: "2026-11-01T17:00:00Z" }) });
      expect(range.json.error).toBe("invalid_range");
    });

    it("leaders may create one for any scout", async () => {
      const r = await call(meetings.POST, { token: f.leader.token, body: meeting({ badgeSlug: "cooking" }) });
      expect(r.status).toBe(201);
    });

    it("GET returns only the caller's meetings", async () => {
      const mine = await call(meetings.GET, { token: f.counselor.token });
      expect(mine.status).toBe(200);
      expect(mine.json.meetings.map((m: { startsAt: string }) => m.startsAt)).toEqual([
        "2026-11-01T18:00:00.000Z",
        "2026-11-02T18:00:00.000Z",
      ]);
      const ranged = await call(meetings.GET, { token: f.counselor.token, query: "?from=2026-11-02T00:00:00Z" });
      expect(ranged.json.meetings.length).toBe(1);
      const elsewhere = await call(meetings.GET, { token: f.counselor.token, query: `?org=${f.otherOrg.slug}` });
      expect(elsewhere.json.meetings).toEqual([]);
      expect((await call(meetings.GET, { token: f.otherCounselor.token })).json).toEqual({ meetings: [] });
      expect((await call(meetings.GET, { token: f.leader.token })).json.meetings.length).toBe(1);
    });
  });
});
