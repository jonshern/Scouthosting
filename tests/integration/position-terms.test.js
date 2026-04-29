import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../lib/db.js";
import { reconcilePositionTerm } from "../../lib/positionTerms.js";
import { resetDb } from "./_setup.js";

describe("reconcilePositionTerm", () => {
  let org;
  let member;

  beforeEach(async () => {
    org = await resetDb();
    member = await prisma.member.create({
      data: { orgId: org.id, firstName: "Alex", lastName: "Park" },
    });
  });

  it("opens a new term when no open term exists", async () => {
    await reconcilePositionTerm(prisma, org.id, member.id, "SPL");
    const terms = await prisma.positionTerm.findMany({ where: { memberId: member.id } });
    expect(terms).toHaveLength(1);
    expect(terms[0].position).toBe("SPL");
    expect(terms[0].endedAt).toBeNull();
  });

  it("is a no-op when the new label matches the open term", async () => {
    await reconcilePositionTerm(prisma, org.id, member.id, "SPL");
    await reconcilePositionTerm(prisma, org.id, member.id, "SPL");
    const terms = await prisma.positionTerm.findMany({ where: { memberId: member.id } });
    expect(terms).toHaveLength(1);
    expect(terms[0].endedAt).toBeNull();
  });

  it("closes the open term and opens a new one when the label changes", async () => {
    const t0 = new Date("2026-01-01T12:00:00Z");
    const t1 = new Date("2026-04-29T12:00:00Z");
    await reconcilePositionTerm(prisma, org.id, member.id, "SPL", t0);
    await reconcilePositionTerm(prisma, org.id, member.id, "Patrol Leader", t1);
    const terms = await prisma.positionTerm.findMany({
      where: { memberId: member.id },
      orderBy: { startedAt: "asc" },
    });
    expect(terms).toHaveLength(2);
    expect(terms[0].position).toBe("SPL");
    expect(terms[0].endedAt?.toISOString()).toBe(t1.toISOString());
    expect(terms[1].position).toBe("Patrol Leader");
    expect(terms[1].endedAt).toBeNull();
  });

  it("closes the open term when the new label is empty", async () => {
    await reconcilePositionTerm(prisma, org.id, member.id, "SPL");
    await reconcilePositionTerm(prisma, org.id, member.id, "");
    const terms = await prisma.positionTerm.findMany({ where: { memberId: member.id } });
    expect(terms).toHaveLength(1);
    expect(terms[0].endedAt).not.toBeNull();
  });

  it("does nothing when both old and new labels are empty", async () => {
    await reconcilePositionTerm(prisma, org.id, member.id, null);
    const terms = await prisma.positionTerm.findMany({ where: { memberId: member.id } });
    expect(terms).toHaveLength(0);
  });
});
