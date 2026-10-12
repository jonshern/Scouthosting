// The demo seed against a real Postgres. Runs only with
//   TEST_DATABASE_URL=postgresql://.../compass_test npm test
// Seeds a second demo unit with its own number and removes it after;
// the demo accounts' @demo.invalid users are used by no other test.
// The full reset (wipe every table) is never run here: the db suites
// share one database.

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { verifyPassword } from "@/lib/auth/password";
import { DEMO_ACCOUNTS, DEMO_EMAIL_DOMAIN, DEMO_PASSWORD } from "./mode";
import { DEMO_ADULTS, DEMO_EVENTS, DEMO_SCOUTS } from "./season";
import { seedDemo } from "./seed";

const db = !!process.env.TEST_DATABASE_URL;
const unitNumber = String(90000 + (Date.now() % 9999));
let orgId: string | null = null;

async function cleanup() {
  if (orgId) {
    // Transactions hold their fund with ON DELETE RESTRICT.
    await prisma.transaction.deleteMany({ where: { orgId } });
    await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } });
}

describe.skipIf(!db)("seedDemo (db)", () => {
  afterAll(cleanup);

  it("writes the whole sample troop", async () => {
    // A previous run that died mid-way may have left the users behind.
    await prisma.user.deleteMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } });
    const now = new Date();
    const summary = await seedDemo({ now, unitNumber });
    orgId = summary.orgId;

    expect(summary).toMatchObject({
      slug: `troop${unitNumber}`,
      accounts: DEMO_ACCOUNTS.length,
      members: DEMO_ADULTS.length + DEMO_SCOUTS.length,
      events: DEMO_EVENTS.length,
    });
    expect(summary.messages).toBeGreaterThan(5);
    expect(summary.transactions).toBeGreaterThan(10);

    const org = await prisma.org.findUniqueOrThrow({ where: { id: summary.orgId } });
    expect(org.isDemo).toBe(true);

    // Each demo account signs in with the published password and has its role.
    for (const a of DEMO_ACCOUNTS) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: a.email },
        include: { accounts: true, memberships: { where: { orgId: org.id } } },
      });
      const cred = user.accounts.find((x) => x.providerId === "credential");
      expect(cred?.password).toBeTruthy();
      expect(await verifyPassword(cred!.password!, DEMO_PASSWORD)).toBe(true);
      expect(user.memberships[0]?.role).toBe(
        a.role === "admin" ? "admin" : a.role === "leader" ? "leader" : "parent",
      );
    }

    // Names are encrypted and come back with the org's key.
    const dek = unwrapDekWithMaster(org);
    const scouts = await prisma.member.findMany({ where: { orgId: org.id, isYouth: true } });
    expect(scouts).toHaveLength(DEMO_SCOUTS.length);
    const names = scouts.map((m) => decryptMemberPii(m, dek, org.id).firstName).sort();
    expect(names).toEqual(DEMO_SCOUTS.map((s) => s.firstName).sort());

    // The parent account's scouts point back at its roster entry.
    const parentMember = await prisma.member.findFirstOrThrow({
      where: { orgId: org.id, email: DEMO_ACCOUNTS.find((a) => a.role === "parent")!.email },
    });
    expect(scouts.filter((s) => s.parentIds.includes(parentMember.id))).toHaveLength(2);

    // Slots, including a full one with a waitlist.
    const waitlisted = await prisma.slotAssignment.count({ where: { orgId: org.id, waitlisted: true } });
    expect(waitlisted).toBeGreaterThanOrEqual(2);
    const stations = await prisma.signupSlot.count({ where: { orgId: org.id, key: { startsWith: "station:" } } });
    expect(stations).toBe(6);

    // Badge day staff, with a staff channel.
    const staff = await prisma.eventStaff.count({ where: { orgId: org.id } });
    expect(staff).toBeGreaterThanOrEqual(6);
    expect(await prisma.channel.count({ where: { orgId: org.id, kind: "event", audience: "staff" } })).toBe(1);

    // Treasury balances match the ledger.
    const funds = await prisma.fund.findMany({ where: { orgId: org.id } });
    for (const f of funds) {
      const sum = await prisma.transaction.aggregate({ where: { fundId: f.id }, _sum: { amountCents: true } });
      expect(f.balanceCents).toBe(sum._sum.amountCents ?? 0);
    }

    // Two-deep: the troop channel has at least two YPT-current leaders.
    const troop = await prisma.channel.findFirstOrThrow({ where: { orgId: org.id, kind: "troop" } });
    const leaders = await prisma.channelMember.count({
      where: {
        channelId: troop.id,
        user: { memberships: { some: { orgId: org.id, role: { in: ["leader", "admin"] }, yptCurrentUntil: { gt: now } } } },
      },
    });
    expect(leaders).toBeGreaterThanOrEqual(2);

    // The counselor sees their badges and assigned scouts.
    const counselor = await prisma.user.findUniqueOrThrow({
      where: { email: DEMO_ACCOUNTS.find((a) => a.role === "counselor")!.email },
      include: { counselorBadges: true, counselorAssignments: true },
    });
    expect(counselor.counselorBadges.length).toBe(3);
    expect(counselor.counselorAssignments.length).toBeGreaterThan(0);
  });
});
