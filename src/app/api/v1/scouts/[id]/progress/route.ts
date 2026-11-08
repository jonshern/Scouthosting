// GET /api/v1/scouts/[id]/progress — a scout's requirement progress,
// keyed by requirement id ("badge:plumbing#6b").
// PUT /api/v1/scouts/[id]/progress — body { items: [{ requirementId,
// status, note? }] }; applies all or nothing.
//
// Who: org admins/leaders see and set everything. A counselor assigned
// to the scout sees and sets only their badges' requirements. The
// scout and their linked parents see everything and may track
// not_started / in_progress / done. Only leaders and the assigned
// counselor may sign off (or undo a sign-off); the server records who
// and when. Every change appends a RequirementProgressEvent, and
// sign-off changes also go to the org's AuditLog.

import { prisma } from "@/lib/db";
import { ApiError, forbidden, json, notFound, parseId, readJson, requireOrgAccessForResource, v1Route } from "@/lib/api/v1";
import { findScout, orgDecryptor, scoutRelation, scoutView } from "@/lib/counselor/access";
import { ProgressPutBody, canReadRequirement, relatesAtAll, type ScoutRelation } from "@/lib/counselor/ids";
import { ProgressRefused, writeProgress } from "@/lib/counselor/progress-write";

export const runtime = "nodejs";

async function load(id: string, user: { id: string; email: string }, write: boolean) {
  const scout = await findScout(parseId(id));
  if (!scout) throw notFound();
  const { org, role } = await requireOrgAccessForResource(scout.orgId, user.id, { write });
  const rel = await scoutRelation(user, role, scout);
  if (!relatesAtAll(rel)) throw forbidden();
  return { scout, org, rel };
}

async function progressBody(scout: NonNullable<Awaited<ReturnType<typeof findScout>>>, rel: ScoutRelation) {
  const rows = await prisma.requirementProgress.findMany({
    where: { memberId: scout.id, orgId: scout.orgId },
    orderBy: { requirementId: "asc" },
  });
  const items: Record<string, unknown> = {};
  for (const r of rows) {
    if (!canReadRequirement(rel, r.requirementId)) continue;
    items[r.requirementId] = {
      status: r.status,
      note: r.note,
      signedOffBy: r.signedOffById,
      signedOffAt: r.signedOffAt,
      updatedAt: r.updatedAt,
    };
  }
  const decrypt = await orgDecryptor(scout.orgId);
  return { scout: scoutView(scout, decrypt), items };
}

export const GET = v1Route<{ id: string }>(async (_req, { user, params }) => {
  const { scout, rel } = await load(params.id, user, false);
  return json(await progressBody(scout, rel));
});

export const PUT = v1Route<{ id: string }>(async (req, { user, params }) => {
  const { scout, rel } = await load(params.id, user, true);
  const { items } = await readJson(req, ProgressPutBody);

  try {
    await writeProgress(scout, rel, user, items);
  } catch (err) {
    if (err instanceof ProgressRefused) {
      throw new ApiError(403, "forbidden", { reason: err.reason, requirementId: err.requirementId });
    }
    throw err;
  }

  return json(await progressBody(scout, rel));
});
