// /api/v1 routes the Compass phone app uses for families: chat
// reactions, "my scouts" and signing permission slips. Real handlers,
// real Postgres. Runs only with TEST_DATABASE_URL set; every row is
// suffix-tagged and removed afterwards.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.K_SERVICE;
});

import { prisma } from "@/lib/db";
import { issueToken } from "@/lib/auth/api-token";
import { provisionOrgVault } from "@/lib/encryption";
import { encryptMemberPii } from "@/lib/members/crypto";

import * as channel from "@/app/api/v1/channels/[id]/route";
import * as messageReactions from "@/app/api/v1/messages/[id]/reactions/route";
import * as myScouts from "@/app/api/v1/me/scouts/route";
import * as event from "@/app/api/v1/events/[id]/route";
import * as slips from "@/app/api/v1/events/[id]/permission-slips/route";

const db = !!process.env.TEST_DATABASE_URL;
const S = `fam${Date.now().toString(36)}${process.pid}`;

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: unknown, opts: { token: string; params?: Record<string, string>; body?: unknown }) {
  const headers: Record<string, string> = { authorization: `Bearer ${opts.token}` };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest("http://localhost/api/v1/test", {
    method: opts.body !== undefined ? "POST" : "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await (handler as Handler)(req, { params: Promise.resolve(opts.params ?? {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are checked field by field
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, any> };
}

async function makeUser(label: string, verified = true) {
  const email = `${label}-${S}@example.invalid`;
  const user = await prisma.user.create({ data: { email, displayName: `${label} ${S}`, emailVerified: verified } });
  return { id: user.id, email, token: (await issueToken(user.id, "test", prisma)).raw };
}

const f = {} as {
  org: { id: string };
  otherOrg: { id: string };
  parent: Awaited<ReturnType<typeof makeUser>>;
  otherParent: Awaited<ReturnType<typeof makeUser>>;
  unverified: Awaited<ReturnType<typeof makeUser>>;
  outsider: Awaited<ReturnType<typeof makeUser>>;
  scoutMember: string;
  otherScoutMember: string;
  channel: string;
  dm: string;
  message: string;
  dmMessage: string;
  slipEvent: string;
  plainEvent: string;
  pastEvent: string;
};

describe.skipIf(!db)("/api/v1 family routes (Postgres)", () => {
  beforeAll(async () => {
    const vault = await provisionOrgVault("test-passphrase-123");
    const mkOrg = (label: string, fields = {}) =>
      prisma.org.create({
        data: {
          slug: `${label}-${S}`,
          unitType: "Troop",
          unitNumber: "100",
          displayName: `${label} ${S}`,
          charterOrg: "Test",
          city: "Test",
          state: "MN",
          scoutmasterName: "Test",
          scoutmasterEmail: `sm-${S}@example.invalid`,
          ...fields,
        },
        select: { id: true },
      });
    f.org = await mkOrg("famorg", vault.fields);
    f.otherOrg = await mkOrg("famother");
    f.parent = await makeUser("parent");
    f.otherParent = await makeUser("otherparent");
    f.unverified = await makeUser("unverified", false);
    f.outsider = await makeUser("outsider");
    await prisma.orgMembership.createMany({
      data: [
        { orgId: f.org.id, userId: f.parent.id, role: "parent" },
        { orgId: f.org.id, userId: f.otherParent.id, role: "parent" },
        { orgId: f.org.id, userId: f.unverified.id, role: "parent" },
        { orgId: f.otherOrg.id, userId: f.outsider.id, role: "parent" },
      ],
    });

    const member = (first: string, data: Record<string, unknown>) =>
      prisma.member.create({
        data: { orgId: f.org.id, ...encryptMemberPii({ firstName: first, lastName: S }, vault.dek, f.org.id), ...data },
        select: { id: true },
      });
    const parentRow = await member("Pat", { email: f.parent.email, isYouth: false });
    const unverifiedRow = await member("Una", { email: f.unverified.email, isYouth: false });
    const otherParentRow = await member("Oli", { email: f.otherParent.email, isYouth: false });
    f.scoutMember = (await member("Sam", { isYouth: true, patrol: "Eagles", parentIds: [parentRow.id, unverifiedRow.id] })).id;
    f.otherScoutMember = (await member("Ola", { isYouth: true, parentIds: [otherParentRow.id] })).id;

    const day = 86400_000;
    const mkEvent = (title: string, startsIn: number, requiresPermissionSlip: boolean) =>
      prisma.event.create({
        data: {
          orgId: f.org.id,
          title: `${title} ${S}`,
          startsAt: new Date(Date.now() + startsIn * day),
          endsAt: new Date(Date.now() + startsIn * day + 3600_000),
          requiresPermissionSlip,
          permissionSlipText: requiresPermissionSlip ? "Sam may go canoeing." : null,
        },
        select: { id: true },
      });
    f.slipEvent = (await mkEvent("Canoe trip", 7, true)).id;
    f.plainEvent = (await mkEvent("Meeting", 3, false)).id;
    f.pastEvent = (await mkEvent("Old trip", -3, true)).id;

    const mkChannel = async (kind: string, members: string[]) =>
      (
        await prisma.channel.create({
          data: {
            orgId: f.org.id,
            kind,
            name: `${kind} ${S}`,
            members: { create: members.map((userId) => ({ userId })) },
          },
        })
      ).id;
    f.channel = await mkChannel("troop", [f.parent.id, f.otherParent.id]);
    f.dm = await mkChannel("dm", [f.otherParent.id]);
    f.message = (await prisma.message.create({ data: { channelId: f.channel, authorId: f.otherParent.id, body: "Hi" } })).id;
    f.dmMessage = (await prisma.message.create({ data: { channelId: f.dm, authorId: f.otherParent.id, body: "Secret" } })).id;
  });

  afterAll(async () => {
    const users = [f.parent, f.otherParent, f.unverified, f.outsider].filter(Boolean).map((u) => u.id);
    await prisma.org.deleteMany({ where: { id: { in: [f.org?.id, f.otherOrg?.id].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.rateLimitBucket.deleteMany({
      where: { OR: users.map((u) => ({ key: { startsWith: `v1:user:${u}` } })) },
    });
  });

  describe("chat reactions", () => {
    it("toggles the caller's emoji and returns the counts", async () => {
      const on = await call(messageReactions.POST, { token: f.parent.token, params: { id: f.message }, body: { emoji: "👍" } });
      expect(on.status).toBe(200);
      expect(on.json.message.reactions).toEqual([{ emoji: "👍", count: 1, youReacted: true }]);

      await call(messageReactions.POST, { token: f.otherParent.token, params: { id: f.message }, body: { emoji: "👍" } });
      const seen = await call(channel.GET, { token: f.parent.token, params: { id: f.channel } });
      const msg = seen.json.messages.find((m: { id: string }) => m.id === f.message);
      expect(msg.reactions).toEqual([{ emoji: "👍", count: 2, youReacted: true }]);

      const off = await call(messageReactions.POST, { token: f.parent.token, params: { id: f.message }, body: { emoji: "👍" } });
      expect(off.json.message.reactions).toEqual([{ emoji: "👍", count: 1, youReacted: false }]);
    });

    it("accepts only emoji", async () => {
      for (const emoji of ["lol", "<b>", "👍 nice", ""]) {
        const r = await call(messageReactions.POST, { token: f.parent.token, params: { id: f.message }, body: { emoji } });
        expect(r.status, emoji).toBe(400);
      }
      const flag = await call(messageReactions.POST, { token: f.parent.token, params: { id: f.message }, body: { emoji: "🇺🇸" } });
      expect(flag.status).toBe(200);
    });

    it("is a 404 for a channel the caller isn't in, or another unit", async () => {
      const dm = await call(messageReactions.POST, { token: f.parent.token, params: { id: f.dmMessage }, body: { emoji: "👍" } });
      expect(dm.status).toBe(404);
      const other = await call(messageReactions.POST, { token: f.outsider.token, params: { id: f.message }, body: { emoji: "👍" } });
      expect(other.status).toBe(404);
      expect(await prisma.reaction.count({ where: { messageId: f.dmMessage } })).toBe(0);
    });
  });

  describe("my scouts", () => {
    it("lists the caller's own scouts with slip status, decrypted", async () => {
      const r = await call(myScouts.GET, { token: f.parent.token });
      expect(r.status).toBe(200);
      const mine = r.json.scouts.filter((s: { orgId: string }) => s.orgId === f.org.id);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ memberId: f.scoutMember, scoutName: `Sam ${S}`, patrol: "Eagles" });
      const trip = mine[0].upcoming.find((u: { eventId: string }) => u.eventId === f.slipEvent);
      expect(trip).toMatchObject({ requiresPermissionSlip: true, slipSigned: false });
    });

    it("shows nothing to an account whose email isn't verified", async () => {
      const r = await call(myScouts.GET, { token: f.unverified.token });
      expect(r.json).toEqual({ scouts: [], emailVerified: false });
    });
  });

  describe("permission slips", () => {
    it("puts the slip text on the event", async () => {
      const r = await call(event.GET, { token: f.parent.token, params: { id: f.slipEvent } });
      expect(r.json.event.permissionSlip).toEqual({ required: true, text: "Sam may go canoeing." });
      const plain = await call(event.GET, { token: f.parent.token, params: { id: f.plainEvent } });
      expect(plain.json.event.permissionSlip).toEqual({ required: false, text: null });
    });

    it("lets a linked parent sign, and snapshots the text", async () => {
      const r = await call(slips.POST, {
        token: f.parent.token,
        params: { id: f.slipEvent },
        body: { memberId: f.scoutMember, signedByName: "Pat Parent" },
      });
      expect(r.status).toBe(200);
      expect(r.json.slip).toMatchObject({ memberId: f.scoutMember, signedByName: "Pat Parent" });
      const row = await prisma.permissionSlip.findUniqueOrThrow({
        where: { eventId_memberId: { eventId: f.slipEvent, memberId: f.scoutMember } },
      });
      expect(row.slipTextSnapshot).toBe("Sam may go canoeing.");
      expect(row.signedByEmail).toBe(f.parent.email.toLowerCase());

      const after = await call(myScouts.GET, { token: f.parent.token });
      const trip = after.json.scouts
        .find((s: { memberId: string }) => s.memberId === f.scoutMember)
        .upcoming.find((u: { eventId: string }) => u.eventId === f.slipEvent);
      expect(trip.slipSigned).toBe(true);
    });

    it("turns down someone else's scout, an unverified email, a past event and an event with no slip", async () => {
      const notMine = await call(slips.POST, {
        token: f.otherParent.token,
        params: { id: f.slipEvent },
        body: { memberId: f.scoutMember, signedByName: "Oli" },
      });
      expect(notMine).toMatchObject({ status: 403, json: { error: "slip_parent" } });

      const unverified = await call(slips.POST, {
        token: f.unverified.token,
        params: { id: f.slipEvent },
        body: { memberId: f.scoutMember, signedByName: "Una" },
      });
      expect(unverified).toMatchObject({ status: 403, json: { error: "email_not_verified" } });

      const past = await call(slips.POST, {
        token: f.parent.token,
        params: { id: f.pastEvent },
        body: { memberId: f.scoutMember, signedByName: "Pat" },
      });
      expect(past).toMatchObject({ status: 403, json: { error: "slip_ended" } });

      const none = await call(slips.POST, {
        token: f.parent.token,
        params: { id: f.plainEvent },
        body: { memberId: f.scoutMember, signedByName: "Pat" },
      });
      expect(none).toMatchObject({ status: 400, json: { error: "slip_not_required" } });

      const outsider = await call(slips.POST, {
        token: f.outsider.token,
        params: { id: f.slipEvent },
        body: { memberId: f.scoutMember, signedByName: "X" },
      });
      expect(outsider.status).toBe(404);

      expect(
        await prisma.permissionSlip.count({ where: { memberId: f.otherScoutMember } }),
      ).toBe(0);
    });

    it("needs a typed name", async () => {
      const r = await call(slips.POST, {
        token: f.parent.token,
        params: { id: f.slipEvent },
        body: { memberId: f.scoutMember, signedByName: "  " },
      });
      expect(r.status).toBe(400);
    });
  });
});
