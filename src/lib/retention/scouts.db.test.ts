// Retention purge against a real Postgres. Skipped unless
// TEST_DATABASE_URL points at a migrated test database.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { purgeExpiredScoutRecords } from "./scouts";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("scout retention against Postgres", () => {
  let prisma: PrismaClient;
  const tag = `retention-db-${Date.now()}`;
  const now = new Date("2026-10-11T00:00:00Z");
  let orgId = "";

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const org = await prisma.org.create({
      data: {
        slug: tag,
        unitType: "Troop",
        unitNumber: "998",
        displayName: "Retention test",
        charterOrg: "Test",
        city: "Test",
        state: "TS",
        scoutmasterName: "Test",
        scoutmasterEmail: `${tag}@example.invalid`,
      },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { endsWith: `-${tag}@example.invalid` } } });
    await prisma?.org.delete({ where: { id: orgId } }).catch(() => {});
    await prisma?.$disconnect();
  });

  it("deletes an expired scout's records and login, keeps current scouts and adults", async () => {
    const scoutEmail = `gone-${tag}@example.invalid`;
    const gone = await prisma.member.create({
      data: { orgId, email: scoutEmail, isYouth: true, status: "alumni", leftAt: new Date("2024-01-01T00:00:00Z") },
    });
    const current = await prisma.member.create({
      data: { orgId, email: `here-${tag}@example.invalid`, isYouth: true, birthdate: new Date("2012-01-01T00:00:00Z") },
    });
    const adult = await prisma.member.create({
      data: { orgId, isYouth: false, status: "alumni", leftAt: new Date("2020-01-01T00:00:00Z") },
    });

    const user = await prisma.user.create({ data: { email: scoutEmail, displayName: "Gone" } });
    await prisma.orgMembership.create({ data: { userId: user.id, orgId, role: "scout" } });
    const channel = await prisma.channel.create({ data: { orgId, kind: "troop", name: "Troop" } });
    await prisma.channelMember.create({ data: { channelId: channel.id, userId: user.id } });
    const msg = await prisma.message.create({ data: { channelId: channel.id, authorId: user.id, body: "hi" } });
    await prisma.photo.create({
      data: { orgId, messageId: msg.id, filename: `${tag}/nope.jpg`, mimeType: "image/jpeg", sizeBytes: 1 },
    });
    const event = await prisma.event.create({ data: { orgId, title: "Campout", startsAt: new Date("2023-06-01") } });
    await prisma.permissionSlip.create({
      data: { orgId, eventId: event.id, memberId: gone.id, signedByName: "Parent", slipTextSnapshot: "ok" },
    });
    await prisma.rsvp.create({ data: { orgId, eventId: event.id, memberId: gone.id, name: "Gone" } });

    const res = await purgeExpiredScoutRecords({ now, prismaClient: prisma, orgId });
    expect(res).toEqual({ purged: 1, failed: 0 });

    expect(await prisma.member.findUnique({ where: { id: gone.id } })).toBeNull();
    expect(await prisma.member.findUnique({ where: { id: current.id } })).not.toBeNull();
    expect(await prisma.member.findUnique({ where: { id: adult.id } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.message.count({ where: { channelId: channel.id } })).toBe(0);
    expect(await prisma.photo.count({ where: { orgId } })).toBe(0);
    expect(await prisma.permissionSlip.count({ where: { orgId } })).toBe(0);
    const trail = await prisma.auditLog.findMany({ where: { orgId, action: "retention-delete" } });
    expect(trail.map((t) => t.entityType).sort()).toEqual(["Member", "PermissionSlip"]);
    expect(trail.some((t) => t.summary?.includes("Parent"))).toBe(false);
    expect(await prisma.rsvp.count({ where: { orgId } })).toBe(0);
  });

  it("keeps a parent's login that shares the scout's email", async () => {
    const shared = `family-${tag}@example.invalid`;
    await prisma.member.create({
      data: { orgId, email: shared, isYouth: true, status: "alumni", leftAt: new Date("2024-01-01T00:00:00Z") },
    });
    const parent = await prisma.user.create({ data: { email: shared, displayName: "Parent" } });
    await prisma.orgMembership.create({ data: { userId: parent.id, orgId, role: "parent" } });

    await purgeExpiredScoutRecords({ now, prismaClient: prisma, orgId });
    expect(await prisma.orgMembership.count({ where: { userId: parent.id, orgId } })).toBe(1);
  });
});
