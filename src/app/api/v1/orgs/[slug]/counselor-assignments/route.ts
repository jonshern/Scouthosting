// Counselor assignments for one org: which adult counsels which scout
// on which badge. Admins and leaders only.
//
// GET    /api/v1/orgs/[id-or-slug]/counselor-assignments
// POST   /api/v1/orgs/[id-or-slug]/counselor-assignments
//        { counselorUserId, scoutId, badgeSlug } → 201 (200 if it already exists)
// DELETE /api/v1/orgs/[id-or-slug]/counselor-assignments?id=…
//        or ?counselorUserId=…&scoutId=…&badgeSlug=…
//
// The counselor must be an adult member of the org (any non-scout
// role, not on the youth roster) and the scout a youth member of the
// same org. Non-members get 404.

import { prisma } from "@/lib/db";
import { LEADER_ROLES, badRequest, json, notFound, readJson, readQuery, v1Route } from "@/lib/api/v1";
import { audit } from "@/lib/audit";
import { findScout, isYouthUser, orgDecryptor, requireOrgHidden, scoutView } from "@/lib/counselor/access";
import { AssignmentBody, AssignmentDeleteQuery } from "@/lib/counselor/ids";

export const runtime = "nodejs";

const SELECT = {
  id: true,
  counselorUserId: true,
  memberId: true,
  badgeSlug: true,
  createdAt: true,
  counselor: { select: { displayName: true } },
} as const;

type Row = {
  id: string;
  counselorUserId: string;
  memberId: string;
  badgeSlug: string;
  createdAt: Date;
  counselor: { displayName: string };
};

const view = (a: Row) => ({
  id: a.id,
  counselorUserId: a.counselorUserId,
  counselorName: a.counselor.displayName,
  scoutId: a.memberId,
  badgeSlug: a.badgeSlug,
  createdAt: a.createdAt,
});

export const GET = v1Route<{ slug: string }>(async (_req, { user, params }) => {
  const { org } = await requireOrgHidden(params.slug, user.id, { roles: LEADER_ROLES });
  const rows = await prisma.counselorAssignment.findMany({
    where: { orgId: org.id },
    select: { ...SELECT, member: { select: { id: true, orgId: true, email: true, parentIds: true, encFirstName: true, encLastName: true } } },
    orderBy: [{ badgeSlug: "asc" }, { createdAt: "asc" }],
  });
  const decrypt = await orgDecryptor(org.id);
  return json({
    assignments: rows.map((r) => ({ ...view(r), scout: scoutView(r.member, decrypt) })),
  });
});

export const POST = v1Route<{ slug: string }>(async (req, { user, params }) => {
  const { org } = await requireOrgHidden(params.slug, user.id, { write: true, roles: LEADER_ROLES });
  const input = await readJson(req, AssignmentBody);

  const scout = await findScout(input.scoutId, org.id);
  if (!scout) throw notFound("scout_not_found");

  const counselor = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId: input.counselorUserId, orgId: org.id } },
    select: { role: true, user: { select: { id: true, email: true } } },
  });
  if (!counselor) throw notFound("counselor_not_found");
  if (counselor.role === "scout" || (await isYouthUser(counselor.user, org.id))) {
    throw badRequest("counselor_not_adult");
  }

  const key = { counselorUserId: input.counselorUserId, memberId: scout.id, badgeSlug: input.badgeSlug };
  const existing = await prisma.counselorAssignment.findUnique({
    where: { counselorUserId_memberId_badgeSlug: key },
    select: SELECT,
  });
  if (existing) return json({ assignment: view(existing) });

  const created = await prisma.counselorAssignment.create({
    data: { ...key, orgId: org.id, createdById: user.id },
    select: SELECT,
  });
  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "CounselorAssignment",
    entityId: created.id,
    action: "create",
    summary: `Assigned ${created.counselor.displayName} to counsel ${input.badgeSlug}`,
  });
  return json({ assignment: view(created) }, { status: 201 });
});

export const DELETE = v1Route<{ slug: string }>(async (req, { user, params }) => {
  const { org } = await requireOrgHidden(params.slug, user.id, { write: true, roles: LEADER_ROLES });
  const q = readQuery(req, AssignmentDeleteQuery);
  const where =
    "id" in q
      ? { id: q.id, orgId: org.id }
      : { orgId: org.id, counselorUserId: q.counselorUserId, memberId: q.scoutId, badgeSlug: q.badgeSlug };
  const row = await prisma.counselorAssignment.findFirst({ where, select: { id: true, badgeSlug: true } });
  if (!row) throw notFound();
  await prisma.counselorAssignment.delete({ where: { id: row.id } });
  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "CounselorAssignment",
    entityId: row.id,
    action: "delete",
    summary: `Removed a ${row.badgeSlug} counselor assignment`,
  });
  return json({ ok: true });
});
