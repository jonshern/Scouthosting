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
import * as channels from "@/app/api/v1/channels/route";
import * as orgEvents from "@/app/api/v1/orgs/[slug]/events/route";
import * as rsvp from "@/app/api/v1/events/[id]/rsvp/route";
import * as orgPosts from "@/app/api/v1/orgs/[slug]/posts/route";
import * as postReactions from "@/app/api/v1/posts/[id]/reactions/route";
import * as support from "@/app/api/v1/support/route";

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
    await prisma.supportTicket.deleteMany({ where: { userId: { in: [f.parent?.id].filter(Boolean) } } });
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

  describe("what the app's screens read", () => {
    it("calendar events carry category, counts and my RSVP", async () => {
      await prisma.eventCategory.deleteMany({ where: { orgId: f.org.id } });
      await prisma.event.update({ where: { id: f.slipEvent }, data: { category: "campout", capacity: 12, cost: 25 } });
      await call(rsvp.POST, { token: f.parent.token, params: { id: f.slipEvent }, body: { response: "yes" } });
      const r = await call(orgEvents.GET, { token: f.parent.token, params: { slug: f.org.id } });
      const trip = r.json.events.find((e: { id: string }) => e.id === f.slipEvent);
      expect(trip).toMatchObject({
        categoryLabel: expect.any(String),
        color: expect.any(String),
        capacity: 12,
        costCents: 2500,
        rsvpYesCount: 1,
        rsvpTotalCount: 1,
        myRsvp: "yes",
      });
      const detail = await call(event.GET, { token: f.parent.token, params: { id: f.slipEvent } });
      expect(detail.json.event).toMatchObject({ cost: 25, capacity: 12, categoryLabel: trip.categoryLabel });
    });

    it("an RSVP that leaves out guests and notes keeps them", async () => {
      await call(rsvp.POST, { token: f.parent.token, params: { id: f.plainEvent }, body: { response: "yes", guests: 2, notes: "Bringing snacks" } });
      const r = await call(rsvp.POST, { token: f.parent.token, params: { id: f.plainEvent }, body: { response: "maybe" } });
      expect(r.json.rsvp).toMatchObject({ response: "maybe", guests: 2, notes: "Bringing snacks" });
      const detail = await call(event.GET, { token: f.parent.token, params: { id: f.plainEvent } });
      expect(detail.json.event.myRsvp).toMatchObject({ response: "maybe", guests: 2, notes: "Bringing snacks" });
    });

    it("posts carry author, photos and reaction counts; a reaction returns the new counts", async () => {
      const post = await prisma.post.create({
        data: { orgId: f.org.id, authorId: f.otherParent.id, title: `Post ${S}`, body: "Hello", visibility: "members" },
      });
      const liked = await call(postReactions.POST, { token: f.parent.token, params: { id: post.id }, body: { kind: "like" } });
      expect(liked.json).toMatchObject({ postId: post.id, likes: 1, youLiked: true, bookmarks: 0 });
      const r = await call(orgPosts.GET, { token: f.parent.token, params: { slug: f.org.id } });
      const p = r.json.posts.find((x: { id: string }) => x.id === post.id);
      expect(p.author).toMatchObject({ displayName: `otherparent ${S}` });
      expect(p.photos).toEqual([]);
      expect(p.reactions).toEqual({ likes: 1, bookmarks: 0, youLiked: true, youBookmarked: false });
    });

    it("DM channels name the other person", async () => {
      await prisma.channelMember.create({ data: { channelId: f.dm, userId: f.parent.id } });
      try {
        const r = await call(channels.GET, { token: f.parent.token });
        const dm = r.json.channels.find((c: { id: string }) => c.id === f.dm);
        expect(dm).toMatchObject({ kind: "dm", dmCounterpartyName: `otherparent ${S}`, dmCounterpartyUserId: f.otherParent.id });
        const troop = r.json.channels.find((c: { id: string }) => c.id === f.channel);
        expect(troop.dmCounterpartyName).toBeNull();
        const detail = await call(channel.GET, { token: f.parent.token, params: { id: f.dm } });
        expect(detail.json.channel.dmCounterpartyName).toBe(`otherparent ${S}`);
      } finally {
        await prisma.channelMember.deleteMany({ where: { channelId: f.dm, userId: f.parent.id } });
      }
    });

    it("a support ticket keeps the category the app picked", async () => {
      const r = await call(support.POST, {
        token: f.parent.token,
        body: { subject: "Broken", body: "The calendar is empty", category: "bug", orgId: f.org.id },
      });
      expect(r.status).toBe(200);
      const t = await prisma.supportTicket.findUniqueOrThrow({ where: { id: r.json.id } });
      expect(t.category).toBe("bug");
    });
  });
});
