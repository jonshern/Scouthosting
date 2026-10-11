// Event delete against a real Postgres. Skipped unless
// TEST_DATABASE_URL points at a migrated test database.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { deleteEventWithSlipTrace } from "./delete";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("event delete keeps a slip trace", () => {
  let prisma: PrismaClient;
  const tag = `event-delete-db-${Date.now()}`;
  let orgId = "";
  let otherOrgId = "";

  const orgData = (slug: string) => ({
    slug,
    unitType: "Troop" as const,
    unitNumber: "997",
    displayName: "Event delete test",
    charterOrg: "Test",
    city: "Test",
    state: "TS",
    scoutmasterName: "Test",
    scoutmasterEmail: `${slug}@example.invalid`,
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    orgId = (await prisma.org.create({ data: orgData(tag) })).id;
    otherOrgId = (await prisma.org.create({ data: orgData(`${tag}-other`) })).id;
  });

  afterAll(async () => {
    await prisma?.org.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
    await prisma?.$disconnect();
  });

  it("writes an audit row per signed slip without the signer's details, then deletes", async () => {
    const event = await prisma.event.create({ data: { orgId, title: "Campout", startsAt: new Date("2026-11-01") } });
    const member = await prisma.member.create({ data: { orgId, isYouth: true } });
    const slip = await prisma.permissionSlip.create({
      data: {
        orgId,
        eventId: event.id,
        memberId: member.id,
        signedByName: "Pat Parent",
        signedByEmail: `pat-${tag}@example.invalid`,
        signedIp: "203.0.113.9",
        slipTextSnapshot: "I consent",
      },
    });

    expect(await deleteEventWithSlipTrace({ orgId, eventId: event.id, prismaClient: prisma })).toBe(true);

    expect(await prisma.event.findUnique({ where: { id: event.id } })).toBeNull();
    expect(await prisma.permissionSlip.findUnique({ where: { id: slip.id } })).toBeNull();
    const audit = await prisma.auditLog.findMany({ where: { orgId, entityId: slip.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0].summary).toContain(event.id);
    expect(audit[0].summary).not.toContain("Pat");
    expect(audit[0].summary).not.toContain("203.0.113.9");
  });

  it("refuses an event from another unit", async () => {
    const event = await prisma.event.create({
      data: { orgId: otherOrgId, title: "Other", startsAt: new Date("2026-11-01") },
    });
    expect(await deleteEventWithSlipTrace({ orgId, eventId: event.id, prismaClient: prisma })).toBe(false);
    expect(await prisma.event.findUnique({ where: { id: event.id } })).not.toBeNull();
  });
});
