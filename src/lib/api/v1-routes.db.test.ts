// End-to-end checks for the /api/v1 mobile API: real route handlers,
// real Postgres, real bearer tokens. Runs only with
//   TEST_DATABASE_URL=postgresql://.../compass_test npm test
// against a migrated, disposable database. Each run creates its own
// orgs/users (suffix-tagged) and removes them afterwards.

import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  // vi.hoisted runs before imports, so require() is the only way in.
  /* eslint-disable @typescript-eslint/no-require-imports */
  process.env.LOCAL_UPLOADS_DIR = require("node:fs").mkdtempSync(
    require("node:path").join(require("node:os").tmpdir(), "v1-uploads-"),
  );
  /* eslint-enable @typescript-eslint/no-require-imports */
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.K_SERVICE;
});

import { prisma } from "@/lib/db";
import { issueToken, revokeToken } from "@/lib/auth/api-token";
import { provisionOrgVault } from "@/lib/encryption";

import * as me from "@/app/api/v1/auth/me/route";
import * as tokenById from "@/app/api/v1/auth/token/[id]/route";
import * as tokenCurrent from "@/app/api/v1/auth/token/current/route";
import * as channels from "@/app/api/v1/channels/route";
import * as channel from "@/app/api/v1/channels/[id]/route";
import * as messages from "@/app/api/v1/channels/[id]/messages/route";
import * as event from "@/app/api/v1/events/[id]/route";
import * as rsvp from "@/app/api/v1/events/[id]/rsvp/route";
import * as albumPhotos from "@/app/api/v1/orgs/[slug]/albums/[albumId]/photos/route";
import * as dashboard from "@/app/api/v1/orgs/[slug]/dashboard/route";
import * as orgEvents from "@/app/api/v1/orgs/[slug]/events/route";
import * as orgPhotos from "@/app/api/v1/orgs/[slug]/photos/route";
import * as orgPosts from "@/app/api/v1/orgs/[slug]/posts/route";
import * as upcoming from "@/app/api/v1/orgs/[slug]/upcoming-events/route";
import * as reactions from "@/app/api/v1/posts/[id]/reactions/route";
import * as pushRegister from "@/app/api/v1/push/register/route";
import * as pushUnregister from "@/app/api/v1/push/unregister/route";
import * as support from "@/app/api/v1/support/route";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}`;

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(
  handler: Handler,
  opts: {
    token?: string | null;
    method?: string;
    params?: Record<string, string>;
    query?: string;
    body?: unknown;
    form?: FormData;
    headers?: Record<string, string>;
  } = {},
) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  const req = new NextRequest(`http://localhost/api/v1/test${opts.query ?? ""}`, {
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
  return { status: res.status, json, text, headers: res.headers };
}

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

// Fixture handles, filled in beforeAll.
const f = {} as {
  org: { id: string; slug: string };
  otherOrg: { id: string; slug: string };
  admin: { id: string; token: string };
  leader: { id: string; token: string; email: string };
  parent: { id: string; token: string; email: string };
  scout: { id: string; token: string };
  outsider: { id: string; token: string };
  leaver: { id: string; token: string };
  troopChannel: string;
  leadersChannel: string;
  youthChannel: string;
  dmChannel: string;
  otherOrgChannel: string;
  event: string;
  otherOrgEvent: string;
  post: string;
  draftPost: string;
  album: string;
  revokedToken: string;
  expiredToken: string;
};

async function makeUser(label: string) {
  const email = `${label}-${S}@example.invalid`;
  const user = await prisma.user.create({ data: { email, displayName: `${label} ${S}` } });
  const token = await issueToken(user.id, "test", prisma);
  return { id: user.id, token: token.raw, email };
}

async function makeOrg(label: string, withVault = false) {
  const vault = withVault ? (await provisionOrgVault("test-passphrase-123")).fields : {};
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
    select: { id: true, slug: true },
  });
}

describe.skipIf(!db)("/api/v1 (Postgres)", () => {
  beforeAll(async () => {
    f.org = await makeOrg("v1org", true);
    f.otherOrg = await makeOrg("v1other");
    const ypt = new Date(Date.now() + 365 * 86400_000);
    f.admin = await makeUser("admin");
    f.leader = await makeUser("leader");
    f.parent = await makeUser("parent");
    f.scout = await makeUser("scout");
    f.outsider = await makeUser("outsider");
    f.leaver = await makeUser("leaver");
    await prisma.orgMembership.createMany({
      data: [
        { orgId: f.org.id, userId: f.admin.id, role: "admin", yptCurrentUntil: ypt },
        { orgId: f.org.id, userId: f.leader.id, role: "leader", yptCurrentUntil: ypt },
        { orgId: f.org.id, userId: f.parent.id, role: "parent" },
        { orgId: f.org.id, userId: f.scout.id, role: "scout" },
        { orgId: f.otherOrg.id, userId: f.outsider.id, role: "admin" },
      ],
    });

    const mk = async (orgId: string, kind: string, name: string, members: string[], postPolicy = "members") =>
      (
        await prisma.channel.create({
          data: {
            orgId,
            kind,
            name,
            postPolicy,
            members: { create: members.map((userId) => ({ userId })) },
          },
        })
      ).id;
    // `leaver` left the org, so the two-deep check counts them as youth;
    // two YPT-current adults keep the channel open.
    f.troopChannel = await mk(f.org.id, "troop", "Troop", [f.admin.id, f.leader.id, f.parent.id, f.leaver.id]);
    f.leadersChannel = await mk(f.org.id, "custom", "Announcements", [f.admin.id, f.parent.id], "leaders");
    // A scout with only one YPT-current adult: below two-deep.
    f.youthChannel = await mk(f.org.id, "patrol", "Eagles", [f.admin.id, f.scout.id]);
    f.dmChannel = await mk(f.org.id, "dm", `dm-${S}`, [f.parent.id, f.scout.id]);
    f.otherOrgChannel = await mk(f.otherOrg.id, "troop", "Other", [f.outsider.id]);
    await prisma.message.create({ data: { channelId: f.troopChannel, authorId: f.admin.id, body: "hello troop" } });

    const soon = new Date(Date.now() + 7 * 86400_000);
    f.event = (await prisma.event.create({ data: { orgId: f.org.id, title: "Campout", startsAt: soon } })).id;
    f.otherOrgEvent = (
      await prisma.event.create({ data: { orgId: f.otherOrg.id, title: "Secret", startsAt: soon } })
    ).id;
    await prisma.rsvp.create({
      data: { orgId: f.org.id, eventId: f.event, name: "Private Family Name", email: `fam-${S}@example.invalid`, response: "yes", guests: 2 },
    });

    f.post = (
      await prisma.post.create({ data: { orgId: f.org.id, title: "News", body: "b", publishedAt: new Date(Date.now() - 1000) } })
    ).id;
    f.draftPost = (
      await prisma.post.create({ data: { orgId: f.org.id, title: "Draft", body: "b", publishedAt: new Date(Date.now() + 86400_000) } })
    ).id;
    f.album = (await prisma.album.create({ data: { orgId: f.org.id, title: "Trip", slug: `trip-${S}` } })).id;

    const revoked = await issueToken(f.parent.id, "old phone", prisma);
    await revokeToken(revoked.id, prisma);
    f.revokedToken = revoked.raw;
    f.expiredToken = (await issueToken(f.parent.id, "stale phone", prisma, -1000)).raw;
  });

  afterAll(async () => {
    const users = [f.admin, f.leader, f.parent, f.scout, f.outsider, f.leaver].filter(Boolean).map((u) => u.id);
    await prisma.supportTicket.deleteMany({ where: { userId: { in: users } } });
    await prisma.org.deleteMany({ where: { id: { in: [f.org?.id, f.otherOrg?.id].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.rateLimitBucket.deleteMany({
      where: { OR: users.map((u) => ({ key: { startsWith: `v1:user:${u}` } })) },
    });
    fs.rmSync(process.env.LOCAL_UPLOADS_DIR!, { recursive: true, force: true });
  });

  describe("authentication", () => {
    it("rejects missing, malformed, unknown and revoked tokens with 401 unauthorized", async () => {
      for (const token of [null, "nope", "compass_pat_deadbeef", f.revokedToken, f.expiredToken]) {
        const r = await call(me.GET as Handler, { token });
        expect(r.status).toBe(401);
        expect(r.json).toEqual({ error: "unauthorized" });
        expect(r.headers.get("cache-control")).toBe("private, no-store");
      }
    });

    it("returns only the caller's own memberships, uncacheable", async () => {
      const r = await call(me.GET as Handler, { token: f.parent.token });
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      expect((r.json.memberships as unknown[]).length).toBe(1);
      expect(r.json.user).toMatchObject({ id: f.parent.id });
    });

    it("lets you revoke your own token but not someone else's", async () => {
      const t = await issueToken(f.parent.id, "spare", prisma);
      const other = await call(tokenById.DELETE as Handler, { method: "DELETE", token: f.leader.token, params: { id: t.id } });
      expect(other.status).toBe(404);
      const mine = await call(tokenById.DELETE as Handler, { method: "DELETE", token: f.parent.token, params: { id: t.id } });
      expect(mine.status).toBe(200);
      expect((await call(me.GET as Handler, { token: t.raw })).status).toBe(401);
    });

    it("signs out by revoking only the token that made the request", async () => {
      const phone = await issueToken(f.parent.id, "phone", prisma);
      const tablet = await issueToken(f.parent.id, "tablet", prisma);
      const r = await call(tokenCurrent.DELETE as Handler, { method: "DELETE", token: phone.raw, params: {} });
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ ok: true });
      expect((await call(me.GET as Handler, { token: phone.raw })).status).toBe(401);
      expect((await call(me.GET as Handler, { token: tablet.raw })).status).toBe(200);
      expect((await call(tokenCurrent.DELETE as Handler, { method: "DELETE", token: phone.raw, params: {} })).status).toBe(401);
    });
  });

  describe("org-scoped reads", () => {
    const orgRoutes = [dashboard.GET, orgEvents.GET, orgPhotos.GET, orgPosts.GET, upcoming.GET] as Handler[];

    it("serve members by slug or id", async () => {
      for (const h of orgRoutes) {
        expect((await call(h, { token: f.scout.token, params: { slug: f.org.slug } })).status).toBe(200);
        expect((await call(h, { token: f.parent.token, params: { slug: f.org.id } })).status).toBe(200);
      }
    });

    it("refuse non-members (403), unknown orgs (404) and junk ids (404)", async () => {
      for (const h of orgRoutes) {
        expect((await call(h, { token: f.outsider.token, params: { slug: f.org.slug } })).json).toEqual({ error: "forbidden" });
        expect((await call(h, { token: f.parent.token, params: { slug: `nope-${S}` } })).status).toBe(404);
        expect((await call(h, { token: f.parent.token, params: { slug: "../../etc" } })).status).toBe(404);
      }
    });

    it("hide unpublished posts", async () => {
      const r = await call(orgPosts.GET as Handler, { token: f.parent.token, params: { slug: f.org.slug } });
      const ids = (r.json.posts as Array<{ id: string }>).map((p) => p.id);
      expect(ids).toContain(f.post);
      expect(ids).not.toContain(f.draftPost);
    });

    it("validate event ranges and accept both from/to and since/until", async () => {
      const p = { token: f.parent.token, params: { slug: f.org.slug } };
      expect((await call(orgEvents.GET as Handler, { ...p, query: "?from=garbage" })).json.error).toBe("invalid_request");
      expect((await call(orgEvents.GET as Handler, { ...p, query: "?from=2027-01-01T00:00:00Z&to=2026-01-01T00:00:00Z" })).json.error).toBe("invalid_range");
      const a = await call(orgEvents.GET as Handler, { ...p, query: `?from=${new Date().toISOString()}` });
      const b = await call(orgEvents.GET as Handler, { ...p, query: `?since=${new Date().toISOString()}` });
      expect((a.json.events as unknown[]).length).toBe(1);
      expect(b.json.events).toEqual(a.json.events);
    });
  });

  describe("events", () => {
    it("hide other orgs' events behind 404", async () => {
      const r = await call(event.GET as Handler, { token: f.parent.token, params: { id: f.otherOrgEvent } });
      expect(r.status).toBe(404);
    });

    it("return counts but never other families' names", async () => {
      const r = await call(event.GET as Handler, { token: f.scout.token, params: { id: f.event } });
      expect(r.status).toBe(200);
      expect(r.json.event).toMatchObject({ rsvpSummary: { yes: 1, guests: 2 } });
      expect(r.text).not.toContain("Private Family Name");
      expect(r.text).not.toContain(`fam-${S}`);
    });

    it("validate RSVPs and keep them idempotent per user", async () => {
      const p = { token: f.parent.token, params: { id: f.event } };
      expect((await call(rsvp.POST as Handler, { ...p, body: { response: "perhaps" } })).json.error).toBe("bad_response");
      expect((await call(rsvp.POST as Handler, { ...p, body: { guests: 5000 } })).status).toBe(400);
      expect((await call(rsvp.POST as Handler, { ...p, body: "{oops" })).json.error).toBe("bad_json");
      const a = await call(rsvp.POST as Handler, { ...p, body: { response: "maybe", guests: 1 } });
      const b = await call(rsvp.POST as Handler, { ...p, body: { response: "yes" } });
      expect(a.status).toBe(200);
      expect((b.json.rsvp as { id: string }).id).toBe((a.json.rsvp as { id: string }).id);
      expect(await prisma.rsvp.count({ where: { eventId: f.event, userId: f.parent.id } })).toBe(1);
    });

    it("adopt an earlier email-link RSVP instead of failing on the unique email", async () => {
      const earlier = await prisma.rsvp.create({
        data: { orgId: f.org.id, eventId: f.event, name: "Leader", email: f.leader.email.toUpperCase(), response: "no" },
      });
      // Same email, different case: still the same person.
      const r = await call(rsvp.POST as Handler, { token: f.leader.token, params: { id: f.event }, body: { response: "yes" } });
      expect(r.status).toBe(200);
      expect((r.json.rsvp as { id: string }).id).toBe(earlier.id);
    });

    it("refuse RSVPs from outside the org", async () => {
      const r = await call(rsvp.POST as Handler, { token: f.outsider.token, params: { id: f.event }, body: {} });
      expect(r.status).toBe(404);
    });
  });

  describe("chat", () => {
    it("lists only channels in orgs the user still belongs to", async () => {
      // `leaver` has a stale ChannelMember row but no OrgMembership.
      const r = await call(channels.GET as Handler, { token: f.leaver.token });
      expect(r.json.channels).toEqual([]);
      const p = await call(channels.GET as Handler, { token: f.parent.token });
      const ids = (p.json.channels as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toEqual(expect.arrayContaining([f.troopChannel, f.leadersChannel, f.dmChannel]));
      expect(ids).not.toContain(f.otherOrgChannel);
      expect((await call(channels.GET as Handler, { token: f.parent.token, query: "?orgId=a'b" })).status).toBe(400);
    });

    it("hide channels from non-members and ex-members with 404", async () => {
      for (const [token, id] of [
        [f.leaver.token, f.troopChannel],
        [f.leader.token, f.dmChannel],
        [f.outsider.token, f.troopChannel],
      ]) {
        expect((await call(channel.GET as Handler, { token, params: { id } })).status).toBe(404);
        expect((await call(messages.GET as Handler, { token, params: { id } })).status).toBe(404);
      }
    });

    it("pages messages and validates `before`", async () => {
      const ok = await call(messages.GET as Handler, { token: f.parent.token, params: { id: f.troopChannel } });
      expect((ok.json.messages as Array<{ body: string }>)[0].body).toBe("hello troop");
      const bad = await call(messages.GET as Handler, { token: f.parent.token, params: { id: f.troopChannel }, query: "?before=yesterday" });
      expect(bad.status).toBe(400);
    });

    it("validates message bodies with the codes mobile knows", async () => {
      const p = { token: f.parent.token, params: { id: f.troopChannel } };
      expect((await call(messages.POST as Handler, { ...p, body: { body: "   " } })).json.error).toBe("empty");
      expect((await call(messages.POST as Handler, { ...p, body: {} })).json.error).toBe("empty");
      expect((await call(messages.POST as Handler, { ...p, body: { body: "x".repeat(8001) } })).json.error).toBe("too_long");
    });

    it("posts for channel members and enforces post policy", async () => {
      const ok = await call(messages.POST as Handler, { token: f.parent.token, params: { id: f.troopChannel }, body: { body: "hi" } });
      expect(ok.status).toBe(200);
      const leadersOnly = await call(messages.POST as Handler, { token: f.parent.token, params: { id: f.leadersChannel }, body: { body: "hi" } });
      expect(leadersOnly.status).toBe(403);
      expect(leadersOnly.json).toEqual({ error: "forbidden", reason: "leaders-only" });
    });

    it("won't let a leader write into a conversation they can't read", async () => {
      const r = await call(messages.POST as Handler, { token: f.leader.token, params: { id: f.dmChannel }, body: { body: "hi" } });
      expect(r.status).toBe(404);
      expect(await prisma.message.count({ where: { channelId: f.dmChannel } })).toBe(0);
    });

    it("suspends a youth channel below two-deep and reports channel_suspended", async () => {
      const r = await call(messages.POST as Handler, { token: f.admin.token, params: { id: f.youthChannel }, body: { body: "hi" } });
      expect(r.status).toBe(423);
      expect(r.json.error).toBe("channel_suspended");
      // Only the system notice about the suspension; nothing from the admin.
      expect(await prisma.message.count({ where: { channelId: f.youthChannel, authorId: f.admin.id } })).toBe(0);
    });

    it("doesn't tell outsiders anything about a channel", async () => {
      const r = await call(messages.POST as Handler, { token: f.outsider.token, params: { id: f.youthChannel }, body: { body: "hi" } });
      expect(r.status).toBe(404);
    });
  });

  describe("reactions", () => {
    it("toggle on published posts only", async () => {
      const p = { token: f.scout.token, params: { id: f.post } };
      expect((await call(reactions.POST as Handler, { ...p, body: { kind: "like" } })).json.action).toBe("insert");
      expect((await call(reactions.POST as Handler, { ...p, body: { kind: "like" } })).json.action).toBe("delete");
      expect((await call(reactions.POST as Handler, { ...p, body: { kind: "angry" } })).json.error).toBe("bad_kind");
      expect((await call(reactions.POST as Handler, { token: f.scout.token, params: { id: f.draftPost }, body: { kind: "like" } })).status).toBe(404);
      expect((await call(reactions.POST as Handler, { token: f.outsider.token, params: { id: f.post }, body: { kind: "like" } })).status).toBe(404);
    });
  });

  describe("photo upload", () => {
    const upload = (token: string, bytes: Buffer, type = "image/png", name = "a.png") => {
      const form = new FormData();
      form.append("photo", new File([new Uint8Array(bytes)], name, { type }));
      return call(albumPhotos.POST as Handler, { token, params: { slug: f.org.slug, albumId: f.album }, form });
    };

    it("is for leaders and admins only", async () => {
      expect((await upload(f.parent.token, PNG)).status).toBe(403);
      expect((await upload(f.scout.token, PNG)).status).toBe(403);
    });

    it("rejects non-images even when they claim to be images", async () => {
      const r = await upload(f.leader.token, Buffer.from("<html><script>alert(1)</script></html>"), "image/png", "x.png");
      expect(r.status).toBe(415);
      expect(r.json.error).toBe("unsupported_type");
    });

    it("encrypts bytes and filename at rest and records the uploader", async () => {
      const r = await upload(f.leader.token, PNG, "text/html", "Scout Name Portrait.html");
      expect(r.status).toBe(200);
      const photo = await prisma.photo.findUniqueOrThrow({ where: { id: (r.json.photo as { id: string }).id } });
      expect(photo).toMatchObject({ encrypted: true, mimeType: "image/png", originalName: null, uploaderUserId: f.leader.id });
      expect(photo.filename).toMatch(/\.png$/);
      const stored = fs.readFileSync(path.join(process.env.LOCAL_UPLOADS_DIR!, photo.filename));
      expect(stored.equals(PNG)).toBe(false);
      expect(stored.includes(PNG.subarray(0, 8))).toBe(false);
    });

    it("404s albums from another org", async () => {
      const other = await prisma.album.create({ data: { orgId: f.otherOrg.id, title: "x", slug: `x-${S}` } });
      const form = new FormData();
      form.append("photo", new File([new Uint8Array(PNG)], "a.png", { type: "image/png" }));
      const r = await call(albumPhotos.POST as Handler, { token: f.leader.token, params: { slug: f.org.slug, albumId: other.id }, form });
      expect(r.json.error).toBe("album_not_found");
    });
  });

  describe("suspended orgs are read-only", () => {
    it("blocks writes with 423 org_suspended but still serves reads", async () => {
      await prisma.org.update({ where: { id: f.org.id }, data: { suspendedAt: new Date() } });
      try {
        const w = await call(rsvp.POST as Handler, { token: f.parent.token, params: { id: f.event }, body: {} });
        expect(w.status).toBe(423);
        expect(w.json.error).toBe("org_suspended");
        const m = await call(messages.POST as Handler, { token: f.parent.token, params: { id: f.troopChannel }, body: { body: "x" } });
        expect(m.json.error).toBe("org_suspended");
        expect((await call(dashboard.GET as Handler, { token: f.parent.token, params: { slug: f.org.slug } })).status).toBe(200);
      } finally {
        await prisma.org.update({ where: { id: f.org.id }, data: { suspendedAt: null } });
      }
    });
  });

  describe("push devices", () => {
    it("register, refuse to unregister someone else's, and validate input", async () => {
      const token = `ExponentPushToken[${S}]`;
      expect((await call(pushRegister.POST as Handler, { token: f.parent.token, body: { token, platform: "ios" } })).status).toBe(200);
      expect((await call(pushUnregister.POST as Handler, { token: f.leader.token, body: { token } })).status).toBe(404);
      expect((await call(pushUnregister.POST as Handler, { token: f.parent.token, body: { token } })).status).toBe(200);
      expect((await call(pushRegister.POST as Handler, { token: f.parent.token, body: { token: "" } })).json.error).toBe("missing_token");
      expect((await call(pushRegister.POST as Handler, { token: f.parent.token, body: {} })).json.error).toBe("missing_token");
      expect((await call(pushRegister.POST as Handler, { token: f.parent.token, body: { token: "x".repeat(600) } })).status).toBe(400);
    });
  });

  describe("support + rate limits", () => {
    it("files against an org the user belongs to, never another", async () => {
      const r = await call(support.POST as Handler, { token: f.leader.token, body: { subject: "s", body: "b", orgId: f.otherOrg.id } });
      expect(r.status).toBe(404);
    });

    it("caps tickets per user with 429 + Retry-After", async () => {
      const send = () => call(support.POST as Handler, { token: f.scout.token, body: { subject: "help", body: "please" } });
      const statuses = [];
      for (let i = 0; i < 6; i++) statuses.push((await send()).status);
      expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
      const r = await send();
      expect(r.json.error).toBe("rate_limited");
      expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(await prisma.supportTicket.count({ where: { userId: f.scout.id } })).toBe(5);
    });

    it("limits per client IP using only the trusted platform header", async () => {
      process.env.CLIENT_IP_HEADER = "cf-connecting-ip";
      const ip = `198.51.100.${(process.pid % 250) + 1}`;
      await prisma.rateLimitBucket.upsert({
        where: { key: `v1:ip:${ip}` },
        create: { key: `v1:ip:${ip}`, count: 600, resetAt: new Date(Date.now() + 60_000) },
        update: { count: 600, resetAt: new Date(Date.now() + 60_000) },
      });
      try {
        const blocked = await call(me.GET as Handler, { token: f.parent.token, headers: { "cf-connecting-ip": ip } });
        expect(blocked.status).toBe(429);
        // A forged X-Forwarded-For doesn't move the caller to a new bucket…
        const forged = await call(me.GET as Handler, {
          token: f.parent.token,
          headers: { "cf-connecting-ip": ip, "x-forwarded-for": "10.9.8.7" },
        });
        expect(forged.status).toBe(429);
        // …but a different real client is unaffected.
        const other = await call(me.GET as Handler, { token: f.parent.token, headers: { "cf-connecting-ip": "198.51.100.251" } });
        expect(other.status).toBe(200);
      } finally {
        delete process.env.CLIENT_IP_HEADER;
        await prisma.rateLimitBucket.deleteMany({ where: { key: { in: [`v1:ip:${ip}`, "v1:ip:198.51.100.251"] } } });
      }
    });
  });
});
