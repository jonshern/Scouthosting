// Event staffing + event messaging against real Postgres: the v1 staff,
// channel and announce routes, the public token RSVP route, and the
// channel reconciler's per-audience membership. Runs only with
//   TEST_DATABASE_URL=postgresql://.../compass_test npm test
// Creates its own suffix-tagged orgs/users and removes only those.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.FLY_APP_NAME;
  delete process.env.K_SERVICE;
});

import { prisma } from "@/lib/db";
import { issueToken } from "@/lib/auth/api-token";
import { _setMailDriverForTests, type MailMessage } from "@/lib/mail";
import { hashStaffToken } from "@/lib/events/staff";
import { reconcileEventChannels } from "@/lib/chat";
import { orgPublicOrigin } from "@/lib/tenancy/resolve";

import * as staffRoute from "@/app/api/v1/events/[id]/staff/route";
import * as staffById from "@/app/api/v1/events/[id]/staff/[staffId]/route";
import * as staffRsvp from "@/app/api/v1/events/[id]/staff/rsvp/route";
import * as channelsRoute from "@/app/api/v1/events/[id]/channels/route";
import * as announceRoute from "@/app/api/v1/events/[id]/announce/route";
import * as meStaffing from "@/app/api/v1/me/staffing/route";
import * as rsvpRoute from "@/app/api/v1/events/[id]/rsvp/route";
import * as publicRsvp from "@/app/api/events/staff-rsvp/route";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}st`;

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(
  handler: Handler,
  opts: { token?: string | null; method?: string; params?: Record<string, string>; body?: unknown } = {},
) {
  const headers: Record<string, string> = { host: "troop.example.test" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: string | undefined;
  if (opts.body !== undefined) {
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  const req = new NextRequest("http://troop.example.test/api/test", {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json, text };
}

const mail: MailMessage[] = [];

type U = { id: string; token: string; email: string };
const f = {} as {
  org: { id: string; slug: string };
  family2: U; // another parent in the org
  otherOrg: { id: string };
  admin: U;
  leader: U;
  parent: U; // plain parent, attends
  helper: U; // parent-role adult who staffs the event
  scout: U; // scout role
  rosterYouth: U; // parent role, but email on a youth roster entry
  counselor: U; // no org membership; verified email
  unverified: U; // not verified; same email as a staff row
  outsider: U; // admin of the other org
  event: string;
  otherEvent: string;
  otherOrgEvent: string;
  slotA: string;
  slotB: string;
  otherSlot: string;
  youthMemberEmail: string;
  guardianEmail: string;
};

async function makeUser(label: string, verified = true): Promise<U> {
  const email = `${label}-${S}@example.invalid`;
  const user = await prisma.user.create({ data: { email, displayName: `${label} ${S}`, emailVerified: verified } });
  const token = await issueToken(user.id, "test", prisma);
  return { id: user.id, token: token.raw, email };
}

async function makeOrg(label: string) {
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
    },
    select: { id: true, slug: true },
  });
}

async function channelMembers(channelId: string): Promise<string[]> {
  const rows = await prisma.channelMember.findMany({ where: { channelId }, select: { userId: true } });
  return rows.map((r) => r.userId).sort();
}

describe.skipIf(!db)("event staff + messaging (Postgres)", () => {
  beforeAll(async () => {
    _setMailDriverForTests({
      async send(m) {
        mail.push(m);
        return { ok: true, messageId: `t-${mail.length}` };
      },
    });
    f.org = await makeOrg("staff-org");
    f.otherOrg = await makeOrg("staff-other");
    const ypt = new Date(Date.now() + 365 * 86400_000);
    f.admin = await makeUser("admin");
    f.leader = await makeUser("leader");
    f.parent = await makeUser("parent");
    f.helper = await makeUser("helper");
    f.scout = await makeUser("scout");
    f.rosterYouth = await makeUser("rosteryouth");
    f.family2 = await makeUser("family2");
    f.counselor = await makeUser("counselor");
    f.unverified = await makeUser("unverified", false);
    f.outsider = await makeUser("outsider");
    await prisma.orgMembership.createMany({
      data: [
        { orgId: f.org.id, userId: f.admin.id, role: "admin", yptCurrentUntil: ypt },
        { orgId: f.org.id, userId: f.leader.id, role: "leader", yptCurrentUntil: ypt },
        { orgId: f.org.id, userId: f.parent.id, role: "parent" },
        { orgId: f.org.id, userId: f.helper.id, role: "parent" },
        { orgId: f.org.id, userId: f.scout.id, role: "scout" },
        { orgId: f.org.id, userId: f.rosterYouth.id, role: "parent" },
        { orgId: f.org.id, userId: f.family2.id, role: "parent" },
        { orgId: f.otherOrg.id, userId: f.outsider.id, role: "admin" },
      ],
    });

    f.youthMemberEmail = `kid-${S}@example.invalid`;
    f.guardianEmail = `guardian-${S}@example.invalid`;
    const guardian = await prisma.member.create({
      data: { orgId: f.org.id, email: f.guardianEmail, isYouth: false },
    });
    // The parent user is on the roster as the scout user's guardian.
    const parentMember = await prisma.member.create({
      data: { orgId: f.org.id, email: f.parent.email, isYouth: false },
    });
    const guardian2 = await prisma.member.create({
      data: { orgId: f.org.id, email: `guardian2-${S}@example.invalid`, isYouth: false },
    });
    await prisma.member.createMany({
      data: [
        // rosterYouth's only guardian has no Compass account.
        { orgId: f.org.id, email: f.rosterYouth.email, isYouth: true, parentIds: [guardian.id] },
        { orgId: f.org.id, email: f.youthMemberEmail, isYouth: true, parentIds: [guardian.id] },
        { orgId: f.org.id, email: f.scout.email, isYouth: true, parentIds: [parentMember.id] },
        { orgId: f.org.id, email: `kid2-${S}@example.invalid`, isYouth: true, parentIds: [guardian2.id] },
        // A youth in a different org entirely.
        { orgId: f.otherOrg.id, email: `elsewhere-youth-${S}@example.invalid`, isYouth: true },
      ],
    });

    const soon = new Date(Date.now() + 14 * 86400_000);
    f.event = (await prisma.event.create({ data: { orgId: f.org.id, title: "Badge Day", startsAt: soon } })).id;
    f.otherEvent = (await prisma.event.create({ data: { orgId: f.org.id, title: "Other", startsAt: soon } })).id;
    f.otherOrgEvent = (await prisma.event.create({ data: { orgId: f.otherOrg.id, title: "Theirs", startsAt: soon } })).id;
    f.slotA = (
      await prisma.signupSlot.create({ data: { orgId: f.org.id, eventId: f.event, title: "First Aid", key: `station:wp-fa-${S}` } })
    ).id;
    f.slotB = (await prisma.signupSlot.create({ data: { orgId: f.org.id, eventId: f.event, title: "Cooking" } })).id;
    f.otherSlot = (await prisma.signupSlot.create({ data: { orgId: f.org.id, eventId: f.otherEvent, title: "X" } })).id;
  });

  afterAll(async () => {
    _setMailDriverForTests(null);
    const users = [
      f.admin, f.leader, f.parent, f.helper, f.scout, f.rosterYouth, f.counselor, f.unverified, f.outsider, f.family2,
    ].filter(Boolean).map((u) => u.id);
    await prisma.org.deleteMany({ where: { id: { in: [f.org?.id, f.otherOrg?.id].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.rateLimitBucket.deleteMany({
      where: { OR: users.map((u) => ({ key: { startsWith: `v1:user:${u}` } })) },
    });
    // Unknown client IP in tests → the shared "anon" bucket; only this
    // file posts to the staff RSVP route.
    await prisma.rateLimitBucket.deleteMany({ where: { key: "staff-rsvp:ip:anon" } });
  });

  const addBody = (label: string, extra: Record<string, unknown> = {}) => ({
    name: `${label} ${S}`,
    email: `${label}-${S}@example.invalid`,
    role: "counselor",
    ...extra,
  });

  describe("authorization", () => {
    it("lets leaders and admins list staff; members get 403, other orgs 404", async () => {
      expect((await call(staffRoute.GET as Handler, { token: f.leader.token, params: { id: f.event } })).status).toBe(200);
      expect((await call(staffRoute.GET as Handler, { token: f.admin.token, params: { id: f.event } })).status).toBe(200);
      const member = await call(staffRoute.GET as Handler, { token: f.parent.token, params: { id: f.event } });
      expect(member.status).toBe(403);
      expect(member.json).toMatchObject({ error: "forbidden", reason: "role" });
      expect((await call(staffRoute.GET as Handler, { token: f.outsider.token, params: { id: f.event } })).status).toBe(404);
      // A leader can't reach another org's event either.
      expect((await call(staffRoute.GET as Handler, { token: f.leader.token, params: { id: f.otherOrgEvent } })).status).toBe(404);
      expect((await call(staffRoute.GET as Handler, { token: f.leader.token, params: { id: "nope" } })).status).toBe(404);
      expect((await call(staffRoute.GET as Handler, { token: null, params: { id: f.event } })).status).toBe(401);
    });

    it("refuses writes from members and other orgs", async () => {
      const body = addBody("blocked");
      expect((await call(staffRoute.POST as Handler, { token: f.parent.token, params: { id: f.event }, body })).status).toBe(403);
      expect((await call(staffRoute.POST as Handler, { token: f.outsider.token, params: { id: f.event }, body })).status).toBe(404);
      expect((await call(channelsRoute.POST as Handler, { token: f.parent.token, params: { id: f.event }, body: { audience: "staff" } })).status).toBe(403);
      expect(
        (await call(announceRoute.POST as Handler, {
          token: f.scout.token,
          params: { id: f.event },
          body: { scope: "staff", subject: "s", body: "b" },
        })).status,
      ).toBe(403);
      expect(await prisma.eventStaff.count({ where: { eventId: f.event, email: body.email } })).toBe(0);
    });
  });

  describe("adding staff", () => {
    it("creates the row, stores only a token hash, and emails a working link", async () => {
      const before = mail.length;
      const r = await call(staffRoute.POST as Handler, {
        token: f.leader.token,
        params: { id: f.event },
        body: { name: "Casey Counselor", email: f.counselor.email.toUpperCase(), role: "counselor", slotId: f.slotA, phone: "555-0100" },
      });
      expect(r.status).toBe(201);
      expect(r.json.inviteSent).toBe(true);
      expect(r.json.staff).toMatchObject({
        name: "Casey Counselor",
        email: f.counselor.email,
        phone: "555-0100",
        role: "counselor",
        status: "invited",
        station: { slotId: f.slotA, key: `station:wp-fa-${S}`, title: "First Aid" },
        respondedAt: null,
      });
      expect(r.text).not.toContain("rsvpTokenHash");

      const sent = mail.slice(before);
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe(f.counselor.email);
      const token = /staff-rsvp\?token=([A-Za-z0-9_-]+)/.exec(sent[0].html)?.[1];
      expect(token).toBeTruthy();
      // Built from the org's canonical address, not the request's Host.
      expect(sent[0].html).toContain(`${orgPublicOrigin({ slug: f.org.slug })}/staff-rsvp?token=`);
      expect(sent[0].html).not.toContain("troop.example.test");
      const row = await prisma.eventStaff.findFirstOrThrow({ where: { eventId: f.event, email: f.counselor.email } });
      expect(row.rsvpTokenHash).toBe(hashStaffToken(token!));
      expect(row.rsvpTokenHash).not.toBe(token);
    });

    it("refuses youth addresses (roster youth or scout accounts)", async () => {
      for (const email of [f.youthMemberEmail, f.rosterYouth.email.toUpperCase(), f.scout.email]) {
        const r = await call(staffRoute.POST as Handler, {
          token: f.leader.token,
          params: { id: f.event },
          body: { name: "Kid", email, role: "volunteer" },
        });
        expect(r.status).toBe(400);
        expect(r.json.error).toBe("youth_email");
      }
    });

    it("validates input, duplicates, and stations from other events", async () => {
      const p = { token: f.leader.token, params: { id: f.event } };
      expect((await call(staffRoute.POST as Handler, { ...p, body: addBody("bad", { role: "boss" }) })).json.error).toBe("bad_role");
      expect((await call(staffRoute.POST as Handler, { ...p, body: addBody("bad", { email: "x" }) })).json.error).toBe("bad_email");
      expect((await call(staffRoute.POST as Handler, { ...p, body: addBody("bad", { slotId: f.otherSlot }) })).json.error).toBe("bad_slot");
      const dup = await call(staffRoute.POST as Handler, {
        ...p,
        body: { name: "Again", email: f.counselor.email, role: "staff" },
      });
      expect(dup.status).toBe(409);
      expect(dup.json.error).toBe("staff_exists");
    });

    it("adds the helper and a few others for the rest of the suite", async () => {
      const p = { token: f.admin.token, params: { id: f.event } };
      for (const body of [
        { name: "Helper", email: f.helper.email, role: "staff", slotId: f.slotB },
        { name: "Unverified Match", email: f.unverified.email, role: "volunteer" },
        addBody("declines", { role: "volunteer" }),
        addBody("pending", { role: "volunteer" }),
      ]) {
        expect((await call(staffRoute.POST as Handler, { ...p, body })).status).toBe(201);
      }
      const list = await call(staffRoute.GET as Handler, { token: f.leader.token, params: { id: f.event } });
      expect((list.json.staff as unknown[]).length).toBe(5);
    });
  });

  describe("staff RSVP", () => {
    it("answers by token without signing in", async () => {
      const row = await prisma.eventStaff.findFirstOrThrow({ where: { eventId: f.event, email: `declines-${S}@example.invalid` } });
      // Swap in a token we know (the real one went out by email).
      const token = `known-token-${S}-abcdefghijklmnop`;
      await prisma.eventStaff.update({ where: { id: row.id }, data: { rsvpTokenHash: hashStaffToken(token) } });

      const r = await call(publicRsvp.POST as unknown as Handler, { body: { token, status: "no", notes: "Out of town" } });
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ staff: { id: row.id, status: "no" } });
      const after = await prisma.eventStaff.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.notes).toBe("Out of town");
      expect(after.respondedAt).not.toBeNull();

      const bad = await call(publicRsvp.POST as unknown as Handler, { body: { token: `wrong-token-${S}-abcdefghijk`, status: "yes" } });
      expect(bad.status).toBe(404);
      expect(bad.json.error).toBe("invalid_token");
      expect((await call(publicRsvp.POST as unknown as Handler, { body: { token, status: "attending" } })).json.error).toBe("bad_status");
      expect((await call(publicRsvp.POST as unknown as Handler, { body: { token: "x", status: "yes" } })).json.error).toBe("invalid_token");
    });

    it("rate-limits guesses at one token", async () => {
      const token = `limited-token-${S}-abcdefghijklmnop`;
      let last = 0;
      for (let i = 0; i < 11; i++) {
        last = (await call(publicRsvp.POST as unknown as Handler, { body: { token, status: "yes" } })).status;
      }
      expect(last).toBe(429);
      await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: `staff-rsvp:token:${hashStaffToken(token).slice(0, 32)}` } } });
    });

    it("answers by bearer token, matching a verified email and linking the account", async () => {
      const r = await call(staffRsvp.POST as Handler, {
        token: f.counselor.token,
        params: { id: f.event },
        body: { status: "yes" },
      });
      expect(r.status).toBe(200);
      expect((r.json.staff as { status: string }).status).toBe("yes");
      const row = await prisma.eventStaff.findFirstOrThrow({ where: { eventId: f.event, email: f.counselor.email } });
      expect(row.userId).toBe(f.counselor.id);

      const helper = await call(staffRsvp.POST as Handler, { token: f.helper.token, params: { id: f.event }, body: { status: "maybe" } });
      expect(helper.status).toBe(200);
    });

    it("won't match an unverified email or someone not on staff", async () => {
      const unverified = await call(staffRsvp.POST as Handler, { token: f.unverified.token, params: { id: f.event }, body: { status: "yes" } });
      expect(unverified.status).toBe(404);
      expect(unverified.json.error).toBe("not_staff");
      const stranger = await call(staffRsvp.POST as Handler, { token: f.parent.token, params: { id: f.event }, body: { status: "yes" } });
      expect(stranger.json.error).toBe("not_staff");
      expect((await call(staffRsvp.POST as Handler, { token: f.counselor.token, params: { id: "nope" }, body: { status: "yes" } })).status).toBe(404);
    });

    it("lists the caller's staffing across orgs", async () => {
      const r = await call(meStaffing.GET as Handler, { token: f.counselor.token });
      expect(r.status).toBe(200);
      const rows = r.json.staffing as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        role: "counselor",
        status: "yes",
        station: { slotId: f.slotA, key: `station:wp-fa-${S}`, title: "First Aid" },
        event: { id: f.event, title: "Badge Day" },
      });
      expect(((await call(meStaffing.GET as Handler, { token: f.unverified.token })).json.staffing as unknown[]).length).toBe(0);
    });
  });

  describe("leader edits", () => {
    it("PATCH changes role, station and status; DELETE removes", async () => {
      const row = await prisma.eventStaff.findFirstOrThrow({ where: { eventId: f.event, email: `pending-${S}@example.invalid` } });
      const p = { token: f.leader.token, params: { id: f.event, staffId: row.id } };
      const r = await call(staffById.PATCH as Handler, { ...p, method: "PATCH", body: { role: "lead", slotId: f.slotA, status: "maybe" } });
      expect(r.status).toBe(200);
      expect(r.json.staff).toMatchObject({ role: "lead", status: "maybe", station: { slotId: f.slotA } });
      expect((r.json.staff as { respondedAt: string | null }).respondedAt).not.toBeNull();
      const cleared = await call(staffById.PATCH as Handler, { ...p, method: "PATCH", body: { slotId: null, status: "invited" } });
      expect(cleared.json.staff).toMatchObject({ station: null, status: "invited", respondedAt: null });
      expect((await call(staffById.PATCH as Handler, { ...p, method: "PATCH", body: {} })).json.error).toBe("empty_patch");
      expect((await call(staffById.PATCH as Handler, { ...p, method: "PATCH", body: { slotId: f.otherSlot } })).json.error).toBe("bad_slot");

      // Member → 403; the row through another event's URL → 404.
      expect((await call(staffById.PATCH as Handler, { ...p, token: f.parent.token, method: "PATCH", body: { role: "staff" } })).status).toBe(403);
      expect(
        (await call(staffById.PATCH as Handler, { ...p, params: { id: f.otherEvent, staffId: row.id }, method: "PATCH", body: { role: "staff" } })).status,
      ).toBe(404);

      expect((await call(staffById.DELETE as Handler, { ...p, method: "DELETE" })).json).toEqual({ ok: true });
      expect((await call(staffById.DELETE as Handler, { ...p, method: "DELETE" })).status).toBe(404);
    });
  });

  describe("event channels", () => {
    let staffChannel = "";
    let stationA = "";
    let families = "";

    it("staff channel: yes/maybe staff in the org plus leaders, never youth or outsiders", async () => {
      // A scout's staff row slipped in before they were a scout: the
      // reconciler must still keep them out.
      await prisma.eventStaff.create({
        data: { orgId: f.org.id, eventId: f.event, userId: f.scout.id, name: "Scout", email: f.scout.email, role: "volunteer", status: "yes" },
      });
      const r = await call(channelsRoute.POST as Handler, { token: f.leader.token, params: { id: f.event }, body: { audience: "staff" } });
      expect(r.status).toBe(200);
      const ch = r.json.channel as { id: string; audience: string; isSuspended: boolean; name: string };
      staffChannel = ch.id;
      expect(ch).toMatchObject({ audience: "staff", isSuspended: false, name: "Badge Day — Staff" });
      // counselor said yes but isn't in the org (email fallback covers them).
      expect(await channelMembers(staffChannel)).toEqual([f.admin.id, f.leader.id, f.helper.id].sort());

      // Asking again returns the same channel.
      const again = await call(channelsRoute.POST as Handler, { token: f.admin.token, params: { id: f.event }, body: { audience: "staff" } });
      expect((again.json.channel as { id: string }).id).toBe(staffChannel);
    });

    it("station channel: only that station's staff", async () => {
      const a = await call(channelsRoute.POST as Handler, { token: f.leader.token, params: { id: f.event }, body: { audience: "station", slotId: f.slotA } });
      stationA = (a.json.channel as { id: string }).id;
      expect(a.json.channel).toMatchObject({ audience: "station", station: { slotId: f.slotA, title: "First Aid" }, name: "Badge Day — First Aid" });
      expect(await channelMembers(stationA)).toEqual([f.admin.id, f.leader.id].sort());
      const b = await call(channelsRoute.POST as Handler, { token: f.leader.token, params: { id: f.event }, body: { audience: "station", slotId: f.slotB } });
      expect(await channelMembers((b.json.channel as { id: string }).id)).toEqual([f.admin.id, f.leader.id, f.helper.id].sort());
      // No key on slot B: the key falls back to station:<slotId>.
      expect((b.json.channel as { station: { key: string } }).station.key).toBe(`station:${f.slotB}`);
      expect((a.json.channel as { station: { key: string } }).station.key).toBe(`station:wp-fa-${S}`);
      expect((await call(channelsRoute.POST as Handler, { token: f.leader.token, params: { id: f.event }, body: { audience: "station" } })).json.error).toBe("missing_slot");
      expect(
        (await call(channelsRoute.POST as Handler, { token: f.leader.token, params: { id: f.event }, body: { audience: "station", slotId: f.otherSlot } })).json.error,
      ).toBe("bad_slot");
    });

    it("families channel: RSVPs and sign-ups; a scout comes with their guardian, or not at all", async () => {
      // The scout RSVPs yes; their parent (f.parent) didn't RSVP.
      await prisma.rsvp.create({ data: { orgId: f.org.id, eventId: f.event, userId: f.scout.id, name: "Scout", email: f.scout.email, response: "yes" } });
      // rosterYouth RSVPs yes, but their only guardian has no account.
      await prisma.rsvp.create({
        data: { orgId: f.org.id, eventId: f.event, userId: f.rosterYouth.id, name: "Roster youth", email: f.rosterYouth.email, response: "yes" },
      });
      await prisma.slotAssignment.create({ data: { orgId: f.org.id, slotId: f.slotB, name: "Helper", email: f.helper.email.toUpperCase() } });
      const r = await call(channelsRoute.POST as Handler, { token: f.leader.token, params: { id: f.event }, body: { audience: "families" } });
      families = (r.json.channel as { id: string }).id;
      expect(r.json.channel).toMatchObject({ audience: "families", isSuspended: false });
      const members = await channelMembers(families);
      expect(members).toEqual([f.admin.id, f.leader.id, f.scout.id, f.parent.id, f.helper.id].sort());
      expect(members).not.toContain(f.rosterYouth.id);
    });

    it("re-syncs when an RSVP comes in through the API", async () => {
      const r = await call(rsvpRoute.POST as Handler, { token: f.family2.token, params: { id: f.event }, body: { response: "yes" } });
      expect(r.status).toBe(200);
      expect(await channelMembers(families)).toContain(f.family2.id);
      await call(rsvpRoute.POST as Handler, { token: f.family2.token, params: { id: f.event }, body: { response: "no" } });
      expect(await channelMembers(families)).not.toContain(f.family2.id);
    });

    it("re-syncs staff channels when a staffer answers", async () => {
      const row = await prisma.eventStaff.findFirstOrThrow({ where: { eventId: f.event, email: f.helper.email } });
      await call(staffById.PATCH as Handler, { token: f.leader.token, method: "PATCH", params: { id: f.event, staffId: row.id }, body: { status: "no" } });
      expect(await channelMembers(staffChannel)).not.toContain(f.helper.id);
      await call(staffRsvp.POST as Handler, { token: f.helper.token, params: { id: f.event }, body: { status: "yes" } });
      expect(await channelMembers(staffChannel)).toContain(f.helper.id);
    });

    it("suspends the families channel when two-deep fails, and only that one", async () => {
      await prisma.orgMembership.update({
        where: { userId_orgId: { userId: f.leader.id, orgId: f.org.id } },
        data: { yptCurrentUntil: new Date(Date.now() - 86400_000) },
      });
      await reconcileEventChannels(f.event, { prismaClient: prisma });
      const fam = await prisma.channel.findUniqueOrThrow({ where: { id: families } });
      expect(fam.isSuspended).toBe(true);
      expect(fam.suspendedReason).toBe("only-one-current-adult");
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: staffChannel } })).isSuspended).toBe(false);

      await prisma.orgMembership.update({
        where: { userId_orgId: { userId: f.leader.id, orgId: f.org.id } },
        data: { yptCurrentUntil: new Date(Date.now() + 365 * 86400_000) },
      });
      await reconcileEventChannels(f.event, { prismaClient: prisma });
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: families } })).isSuspended).toBe(false);
    });

    it("GET: leaders see every channel, members only their own, other orgs 404", async () => {
      const lead = await call(channelsRoute.GET as Handler, { token: f.leader.token, params: { id: f.event } });
      expect((lead.json.channels as unknown[]).length).toBe(4);
      const helper = await call(channelsRoute.GET as Handler, { token: f.helper.token, params: { id: f.event } });
      const ids = (helper.json.channels as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(staffChannel);
      expect(ids).toContain(families);
      expect(ids).not.toContain(stationA);
      // The scout's guardian is only in the families channel.
      const parent = await call(channelsRoute.GET as Handler, { token: f.parent.token, params: { id: f.event } });
      expect((parent.json.channels as Array<{ id: string }>).map((c) => c.id)).toEqual([families]);
      const family2 = await call(channelsRoute.GET as Handler, { token: f.family2.token, params: { id: f.event } });
      expect(family2.json.channels).toEqual([]);
      expect((await call(channelsRoute.GET as Handler, { token: f.outsider.token, params: { id: f.event } })).status).toBe(404);
    });
  });

  describe("announce", () => {
    async function announce(body: Record<string, unknown>) {
      const before = mail.length;
      const r = await call(announceRoute.POST as Handler, {
        token: f.leader.token,
        params: { id: f.event },
        body: { subject: `Subject ${S}`, body: "Hello **all**", ...body },
      });
      return { r, to: mail.slice(before).map((m) => m.to).sort() };
    }

    it("staff: yes/maybe staff only, including people without an account", async () => {
      const { r, to } = await announce({ scope: "staff" });
      expect(r.status).toBe(200);
      expect(r.json.announcement).toMatchObject({ status: "sent", recipientCount: 2, deliveredCount: 2, failedCount: 0 });
      // counselor (yes, outside the org) + helper (yes). Not the
      // scout's row, not invited / declined rows.
      expect(to).toEqual([f.counselor.email, f.helper.email].sort());
      const log = await prisma.mailLog.findUniqueOrThrow({
        where: { id: (r.json.announcement as { mailLogId: string }).mailLogId },
      });
      expect(log).toMatchObject({ orgId: f.org.id, authorId: f.leader.id, audienceLabel: "Event staff: Badge Day", recipientCount: 2 });
    });

    it("staff with includeUnanswered: also reaches invited staff, never those who said no", async () => {
      const pending = `pending-${S}@example.invalid`;
      const declined = `declined-${S}@example.invalid`;
      await prisma.eventStaff.createMany({
        data: [
          { orgId: f.org.id, eventId: f.event, name: "Pending", email: pending, status: "invited" },
          { orgId: f.org.id, eventId: f.event, name: "Declined", email: declined, status: "no" },
        ],
      });
      try {
        const plain = await announce({ scope: "staff" });
        expect(plain.to).not.toContain(pending);
        const { r, to } = await announce({ scope: "staff", includeUnanswered: true });
        expect(r.status).toBe(200);
        expect(to).toContain(pending);
        expect(to).not.toContain(declined);
        expect(to).toEqual(expect.arrayContaining(plain.to));
        const log = await prisma.mailLog.findUniqueOrThrow({
          where: { id: (r.json.announcement as { mailLogId: string }).mailLogId },
        });
        expect(log.audienceLabel).toBe("Event staff, including unanswered: Badge Day");
      } finally {
        await prisma.eventStaff.deleteMany({ where: { eventId: f.event, email: { in: [pending, declined] } } });
      }
    });

    it("station: only that station", async () => {
      const { r, to } = await announce({ scope: "station", slotId: f.slotA });
      expect(to).toEqual([f.counselor.email]);
      const log = await prisma.mailLog.findUniqueOrThrow({ where: { id: (r.json.announcement as { mailLogId: string }).mailLogId } });
      expect(log.audienceLabel).toBe("Station staff: Badge Day — First Aid");
    });

    it("families: adults from RSVPs and sign-ups; a youth RSVP reaches the guardian, never the scout", async () => {
      const kid = await prisma.member.findFirstOrThrow({ where: { orgId: f.org.id, email: f.youthMemberEmail } });
      await prisma.rsvp.create({
        data: { orgId: f.org.id, eventId: f.event, memberId: kid.id, name: "Kid", email: f.youthMemberEmail, response: "yes" },
      });
      // A scout's own slot sign-up (no roster link on the row): the
      // scout's guardian gets the email instead.
      await prisma.slotAssignment.create({
        data: { orgId: f.org.id, slotId: f.slotB, name: "Kid Two", email: `kid2-${S}@example.invalid` },
      });
      // A public (Waypoint) sign-up: the seat is for a scout, the
      // contact is the guardian who signed them up.
      const waypointGuardian = `wp-guardian-${S}@example.invalid`;
      await prisma.slotAssignment.create({
        data: { orgId: f.org.id, slotId: f.slotA, name: "WP Guardian", email: waypointGuardian, scoutName: "Sam K.", phone: "555-0111" },
      });
      const { r, to } = await announce({ scope: "families" });
      expect(r.status).toBe(200);
      // guardianEmail: kid's RSVP (roster-linked). f.parent: the scout
      // user's RSVP has no memberId, matched by email. guardian2: kid2's
      // slot sign-up. rosterYouth's guardian is guardianEmail too.
      expect(to).toEqual(
        [f.guardianEmail, f.helper.email, waypointGuardian, f.parent.email, `guardian2-${S}@example.invalid`].sort(),
      );
      const log = await prisma.mailLog.findUniqueOrThrow({ where: { id: (r.json.announcement as { mailLogId: string }).mailLogId } });
      expect(JSON.stringify(log.recipients)).not.toContain("Sam K.");
      expect(to).not.toContain(f.scout.email);
      expect(to).not.toContain(f.youthMemberEmail);
      expect(to).not.toContain(f.rosterYouth.email);
      expect(to).not.toContain(`kid2-${S}@example.invalid`);
      // family2 RSVP'd "no" earlier, so they're out.
      expect(to).not.toContain(f.family2.email);
    });

    it("validates scope and station", async () => {
      expect((await announce({ scope: "everyone" })).r.json.error).toBe("bad_scope");
      expect((await announce({ scope: "station" })).r.json.error).toBe("missing_slot");
      expect((await announce({ scope: "station", slotId: f.otherSlot })).r.json.error).toBe("bad_slot");
    });
  });

  describe("youth checks and closed events", () => {
    beforeAll(async () => {
      await prisma.rateLimitBucket.deleteMany({ where: { key: "staff-rsvp:ip:anon" } });
    });

    it("refuses a youth address from any org, not just this one", async () => {
      const r = await call(staffRoute.POST as Handler, {
        token: f.leader.token,
        params: { id: f.event },
        body: { name: "Elsewhere", email: `elsewhere-youth-${S}@example.invalid`, role: "volunteer" },
      });
      expect(r.status).toBe(400);
      expect(r.json.error).toBe("youth_email");
    });

    it("re-checks at answer time: an address that became a youth's can't answer", async () => {
      const email = `later-youth-${S}@example.invalid`;
      const token = `later-youth-token-${S}-abcdefghijklmnop`;
      await prisma.eventStaff.create({
        data: { orgId: f.org.id, eventId: f.event, name: "Later", email, role: "volunteer", rsvpTokenHash: hashStaffToken(token) },
      });
      await prisma.member.create({ data: { orgId: f.otherOrg.id, email, isYouth: true } });
      const r = await call(publicRsvp.POST as unknown as Handler, { body: { token, status: "yes" } });
      expect(r.status).toBe(403);
      expect(r.json.error).toBe("youth_email");
    });

    it("closes the link once the event is over (410 event_over)", async () => {
      const past = await prisma.event.create({
        data: { orgId: f.org.id, title: "Last month", startsAt: new Date(Date.now() - 30 * 86400_000) },
      });
      const token = `past-event-token-${S}-abcdefghijklmnop`;
      await prisma.eventStaff.create({
        data: { orgId: f.org.id, eventId: past.id, name: "Late", email: `late-${S}@example.invalid`, role: "volunteer", rsvpTokenHash: hashStaffToken(token) },
      });
      const r = await call(publicRsvp.POST as unknown as Handler, { body: { token, status: "yes" } });
      expect(r.status).toBe(410);
      expect(r.json.error).toBe("event_over");
    });

    it("refuses cross-site browser posts and non-JSON bodies", async () => {
      const token = `known-token-${S}-abcdefghijklmnop`;
      const post = (headers: Record<string, string>, body: string) =>
        publicRsvp.POST(
          new NextRequest("http://troop.example.test/api/events/staff-rsvp", {
            method: "POST",
            headers: { host: "troop.example.test", ...headers },
            body,
          }),
        );
      const json = JSON.stringify({ token, status: "yes" });
      const cross = await post({ "content-type": "application/json", origin: "https://evil.example", "sec-fetch-site": "cross-site" }, json);
      expect(cross.status).toBe(403);
      expect(await cross.json()).toMatchObject({ error: "cross_site" });
      const form = await post({ "content-type": "application/x-www-form-urlencoded" }, `token=${token}&status=yes`);
      expect(form.status).toBe(415);
      const same = await post(
        { "content-type": "application/json", origin: "http://troop.example.test", "sec-fetch-site": "same-origin" },
        json,
      );
      expect(same.status).toBe(200);
    });
  });
});
