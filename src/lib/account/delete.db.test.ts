// Deleting your own account (src/lib/account/delete.ts) through
// DELETE /api/v1/me. Real Postgres; runs only with TEST_DATABASE_URL
// set. Every row is suffix-tagged and removed afterwards.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.K_SERVICE;
});

import { prisma } from "@/lib/db";
import { issueToken } from "@/lib/auth/api-token";
import { DELETED_NAME, deletedEmail, deletionBlockers } from "@/lib/account/delete";
import * as me from "@/app/api/v1/me/route";
import * as authMe from "@/app/api/v1/auth/me/route";

const db = !!process.env.TEST_DATABASE_URL;
const S = `del${Date.now().toString(36)}${process.pid}`;

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: unknown, token: string, body?: unknown) {
  const req = new NextRequest("http://localhost/api/v1/me", {
    method: body === undefined ? "GET" : "DELETE",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await (handler as Handler)(req, { params: Promise.resolve({}) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function makeUser(label: string, data: { isSuperAdmin?: boolean } = {}) {
  const email = `${label}-${S}@example.invalid`;
  const user = await prisma.user.create({
    data: { email, displayName: `${label} ${S}`, emailVerified: true, ...data },
  });
  return { id: user.id, email, token: (await issueToken(user.id, "test", prisma)).raw };
}

const users: string[] = [];
const orgs: string[] = [];

async function makeOrg(label: string, ownerId?: string) {
  const org = await prisma.org.create({
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
      ownerId,
    },
  });
  orgs.push(org.id);
  return org;
}

describe.skipIf(!db)("deleting your account (Postgres)", () => {
  let parent: Awaited<ReturnType<typeof makeUser>>;
  let leader: Awaited<ReturnType<typeof makeUser>>;
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let operator: Awaited<ReturnType<typeof makeUser>>;
  let org: Awaited<ReturnType<typeof makeOrg>>;

  beforeAll(async () => {
    parent = await makeUser("parent");
    leader = await makeUser("leader");
    admin = await makeUser("admin");
    operator = await makeUser("operator", { isSuperAdmin: true });
    users.push(parent.id, leader.id, admin.id, operator.id);
    org = await makeOrg("delorg", admin.id);
    await prisma.orgMembership.createMany({
      data: [
        { orgId: org.id, userId: parent.id, role: "parent" },
        { orgId: org.id, userId: leader.id, role: "leader" },
        { orgId: org.id, userId: admin.id, role: "admin" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.org.deleteMany({ where: { id: { in: orgs } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.rateLimitBucket.deleteMany({
      where: { OR: users.map((u) => ({ key: { startsWith: `v1:user:${u}` } })) },
    });
  });

  it("asks for the account's own email", async () => {
    const res = await call(me.DELETE, parent.token, { confirm: "someone-else@example.invalid" });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("confirm_mismatch");
    expect((await prisma.user.findUnique({ where: { id: parent.id } }))?.email).toBe(parent.email);
  });

  it("removes the person but keeps the unit's records", async () => {
    const channel = await prisma.channel.create({
      data: {
        orgId: org.id,
        kind: "troop",
        name: `troop ${S}`,
        members: { create: [{ userId: parent.id }, { userId: leader.id }] },
      },
    });
    const message = await prisma.message.create({
      data: { channelId: channel.id, authorId: parent.id, body: "See you Saturday" },
    });
    await prisma.reaction.create({ data: { messageId: message.id, userId: parent.id, emoji: "👍" } });
    const event = await prisma.event.create({
      data: { orgId: org.id, title: `Campout ${S}`, startsAt: new Date(), endsAt: new Date() },
    });
    const rsvp = await prisma.rsvp.create({
      data: { orgId: org.id, eventId: event.id, userId: parent.id, name: "Pat", email: parent.email, response: "yes" },
    });
    await prisma.journeyScout.create({ data: { ownerUserId: parent.id, encName: Buffer.from("x") } });
    await prisma.counselorBadge.create({ data: { userId: parent.id, badgeSlug: "hiking" } });
    // A Claude connection (lib/mcp).
    const mcpClient = await prisma.mcpClient.create({ data: { clientId: `mcp_del_${S}`, clientName: "Claude", redirectUris: ["https://claude.ai/cb"] } });
    await prisma.mcpToken.create({
      data: {
        familyId: `fam-${S}`,
        clientId: mcpClient.clientId,
        userId: parent.id,
        scope: "scouts:read",
        resource: "http://localhost:3000/mcp",
        accessHash: `a-${S}`,
        refreshHash: `r-${S}`,
        accessExpiresAt: new Date(Date.now() + 60_000),
        refreshExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    const res = await call(me.DELETE, parent.token, { confirm: parent.email.toUpperCase() });
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { id: parent.id } });
    expect(user?.email).toBe(deletedEmail(parent.id));
    expect(user?.displayName).toBe(DELETED_NAME);
    expect(user?.emailVerified).toBe(false);

    // Gone: sign-ins, memberships, personal data.
    expect(await prisma.apiToken.count({ where: { userId: parent.id } })).toBe(0);
    expect(await prisma.orgMembership.count({ where: { userId: parent.id } })).toBe(0);
    expect(await prisma.channelMember.count({ where: { userId: parent.id } })).toBe(0);
    expect(await prisma.reaction.count({ where: { userId: parent.id } })).toBe(0);
    expect(await prisma.journeyScout.count({ where: { ownerUserId: parent.id } })).toBe(0);
    expect(await prisma.counselorBadge.count({ where: { userId: parent.id } })).toBe(0);
    expect(await prisma.mcpToken.count({ where: { userId: parent.id } })).toBe(0);
    await prisma.mcpClient.delete({ where: { clientId: mcpClient.clientId } });
    expect((await call(authMe.GET, parent.token)).status).toBe(401);

    // Kept: the chat log and the event's RSVP list.
    const kept = await prisma.message.findUnique({ where: { id: message.id }, include: { author: true } });
    expect(kept?.body).toBe("See you Saturday");
    expect(kept?.author?.displayName).toBe(DELETED_NAME);
    expect((await prisma.rsvp.findUnique({ where: { id: rsvp.id } }))?.userId).toBe(parent.id);
  });

  it("won't leave a unit without an admin", async () => {
    const res = await call(me.DELETE, admin.token, { confirm: admin.email });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("account_deletion_blocked");
    expect(res.json.blockers).toEqual([
      expect.objectContaining({ kind: "only_admin", orgName: org.displayName }),
    ]);
    expect((await prisma.user.findUnique({ where: { id: admin.id } }))?.email).toBe(admin.email);

    // Once another leader is an admin, it goes through and the unit loses
    // its owner (a new one claims it the usual way).
    await prisma.orgMembership.update({
      where: { userId_orgId: { userId: leader.id, orgId: org.id } },
      data: { role: "admin" },
    });
    expect(await deletionBlockers(admin.id)).toEqual([]);
    expect((await call(me.DELETE, admin.token, { confirm: admin.email })).status).toBe(200);
    expect((await prisma.org.findUnique({ where: { id: org.id } }))?.ownerId).toBeNull();
  });

  it("refuses for a Compass operator", async () => {
    const res = await call(me.DELETE, operator.token, { confirm: operator.email });
    expect(res.status).toBe(409);
    expect(res.json.blockers).toEqual([expect.objectContaining({ kind: "super_admin" })]);
  });
});
