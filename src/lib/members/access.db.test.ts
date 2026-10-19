// Joining a unit through the roster.
// Skipped unless TEST_DATABASE_URL points at a migrated test database.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { to: string; subject: string; html: string }[] = [];
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async (m: { to: string; subject: string; html: string }) => {
    sent.push(m);
    return { ok: true };
  }),
}));

import { prisma } from "@/lib/db";
import { joinUnitsByRosterEmail, memberAccess } from "./access";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("unit access", () => {
  const tag = `access-${Date.now()}`;
  const email = (who: string) => `${tag}-${who}@example.invalid`;

  async function makeOrg(suffix: string, data: Record<string, unknown> = {}) {
    return prisma.org.create({
      data: {
        slug: `${tag}-${suffix}`,
        unitType: "Troop",
        unitNumber: "9",
        displayName: `Troop 9 ${suffix}`,
        charterOrg: "Test",
        city: "Test",
        state: "MN",
        scoutmasterName: "Test",
        scoutmasterEmail: email(`sm-${suffix}`),
        ...data,
      },
    });
  }

  beforeEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    const orgs = await prisma.org.findMany({ where: { slug: { startsWith: tag } }, select: { id: true } });
    const ids = orgs.map((o) => o.id);
    await prisma.auditLog.deleteMany({ where: { orgId: { in: ids } } });
    await prisma.channelMember.deleteMany({ where: { channel: { orgId: { in: ids } } } });
    await prisma.channel.deleteMany({ where: { orgId: { in: ids } } });
    await prisma.orgMembership.deleteMany({ where: { orgId: { in: ids } } });
    await prisma.member.deleteMany({ where: { orgId: { in: ids } } });
    await prisma.org.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  });

  it("joins only active adults on the roster, as family, and keeps an existing role", async () => {
    const org = await makeOrg("join");
    const other = await makeOrg("other");
    const parent = await prisma.user.create({ data: { email: email("parent"), displayName: "Pat" } });
    const kid = await prisma.user.create({ data: { email: email("kid"), displayName: "Kid" } });
    const gone = await prisma.user.create({ data: { email: email("gone"), displayName: "Gone" } });
    const lead = await prisma.user.create({ data: { email: email("lead"), displayName: "Lee" } });
    await prisma.member.createMany({
      data: [
        { orgId: org.id, email: email("PARENT"), isYouth: false, status: "active" },
        { orgId: org.id, email: email("kid"), isYouth: true, status: "active" },
        { orgId: org.id, email: email("gone"), isYouth: false, status: "active", deletedAt: new Date() },
        { orgId: org.id, email: email("lead"), isYouth: false, status: "active" },
        { orgId: other.id, email: email("parent"), isYouth: false, status: "prospect" },
      ],
    });
    await prisma.orgMembership.create({ data: { userId: lead.id, orgId: org.id, role: "leader" } });

    expect(await joinUnitsByRosterEmail(parent.id, email("parent"))).toEqual([org.id]);
    expect(await joinUnitsByRosterEmail(parent.id, email("parent"))).toEqual([]);
    expect(await joinUnitsByRosterEmail(kid.id, email("kid"))).toEqual([]);
    expect(await joinUnitsByRosterEmail(gone.id, email("gone"))).toEqual([]);
    expect(await joinUnitsByRosterEmail(lead.id, email("lead"))).toEqual([]);

    const roles = await prisma.orgMembership.findMany({
      where: { orgId: { in: [org.id, other.id] } },
      select: { userId: true, orgId: true, role: true },
    });
    expect(roles).toHaveLength(2);
    expect(roles.find((r) => r.userId === parent.id)).toMatchObject({ orgId: org.id, role: "parent" });
    expect(roles.find((r) => r.userId === lead.id)?.role).toBe("leader");

    expect(await memberAccess(org, email("parent"))).toMatchObject({ joined: true, role: "parent", isOwner: false });
    expect(await memberAccess(org, email("kid"))).toEqual({ joined: false });

    // Joining sets up the unit's standing chats with the new family in them.
    const chats = await prisma.channel.findMany({
      where: { orgId: org.id },
      select: { kind: true, members: { select: { userId: true } } },
    });
    expect(chats.find((c) => c.kind === "parents")?.members.map((m) => m.userId)).toContain(parent.id);
  });
});
