// canManageTreasury against a real Postgres: role plus the roster
// position of the Member with the user's email. Runs when
// TEST_DATABASE_URL is set.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("canManageTreasury (database)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let canManageTreasury: typeof import("./treasury-access").canManageTreasury;
  const S = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let orgId = "";
  const userIds: string[] = [];

  async function user(label: string, role: "admin" | "leader" | "parent" | null, position?: string) {
    const email = `${label}-${S}@treasurytest.invalid`;
    const u = await prisma.user.create({ data: { email, displayName: label } });
    userIds.push(u.id);
    if (role) await prisma.orgMembership.create({ data: { orgId, userId: u.id, role } });
    if (position !== undefined) {
      // Roster emails may differ in case from the sign-in email.
      await prisma.member.create({ data: { orgId, email: email.toUpperCase(), position, isYouth: false } });
    }
    return { id: u.id, email, isSuperAdmin: false };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ prisma } = await import("@/lib/db"));
    ({ canManageTreasury } = await import("./treasury-access"));
    const org = await prisma.org.create({
      data: {
        slug: `treasurytest-${S}`,
        unitType: "Troop",
        unitNumber: "3",
        displayName: "Troop 3",
        charterOrg: "Test",
        city: "Test",
        state: "MN",
        scoutmasterName: "Test",
        scoutmasterEmail: `sm-${S}@treasurytest.invalid`,
      },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("allows admins and leaders who are the treasurer", async () => {
    expect(await canManageTreasury(await user("admin", "admin"), orgId)).toBe(true);
    expect(await canManageTreasury(await user("treasurer", "leader", "Treasurer"), orgId)).toBe(true);
  });

  it("refuses other leaders, parents, and people outside the unit", async () => {
    expect(await canManageTreasury(await user("asm", "leader", "Assistant Scoutmaster"), orgId)).toBe(false);
    expect(await canManageTreasury(await user("leader", "leader"), orgId)).toBe(false);
    expect(await canManageTreasury(await user("parent", "parent", "Treasurer"), orgId)).toBe(false);
    expect(await canManageTreasury(await user("outsider", null), orgId)).toBe(false);
  });

  it("allows super-admins without a membership", async () => {
    const u = await user("super", null);
    expect(await canManageTreasury({ ...u, isSuperAdmin: true }, orgId)).toBe(true);
  });
});
