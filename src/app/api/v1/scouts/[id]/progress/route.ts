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
import {
  ProgressPutBody,
  canReadRequirement,
  relatesAtAll,
  writeRefusal,
  type ProgressStatus,
  type ScoutRelation,
} from "@/lib/counselor/ids";

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

  const existing = await prisma.requirementProgress.findMany({
    where: { memberId: scout.id, requirementId: { in: items.map((i) => i.requirementId) } },
  });
  const current = new Map(existing.map((r) => [r.requirementId, r]));

  // Check every item before writing any.
  for (const item of items) {
    const from = (current.get(item.requirementId)?.status ?? null) as ProgressStatus | null;
    const reason = writeRefusal(rel, item.requirementId, from, item.status);
    if (reason) throw new ApiError(403, "forbidden", { reason, requirementId: item.requirementId });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const prev = current.get(item.requirementId);
      const fromStatus = prev?.status ?? null;
      const note = item.note === undefined ? (prev?.note ?? null) : item.note || null;
      if (prev && prev.status === item.status && prev.note === note) continue;

      const signOff =
        item.status === "signed_off"
          ? prev?.status === "signed_off"
            ? { signedOffById: prev.signedOffById, signedOffAt: prev.signedOffAt }
            : { signedOffById: user.id, signedOffAt: now }
          : { signedOffById: null, signedOffAt: null };

      const row = await tx.requirementProgress.upsert({
        where: { memberId_requirementId: { memberId: scout.id, requirementId: item.requirementId } },
        create: {
          orgId: scout.orgId,
          memberId: scout.id,
          requirementId: item.requirementId,
          status: item.status,
          note,
          updatedById: user.id,
          ...signOff,
        },
        update: { status: item.status, note, updatedById: user.id, ...signOff },
      });
      await tx.requirementProgressEvent.create({
        data: {
          orgId: scout.orgId,
          memberId: scout.id,
          requirementId: item.requirementId,
          fromStatus,
          toStatus: item.status,
          note,
          actorUserId: user.id,
        },
      });
      if ((item.status === "signed_off") !== (fromStatus === "signed_off")) {
        await tx.auditLog.create({
          data: {
            orgId: scout.orgId,
            userId: user.id,
            userDisplay: user.displayName,
            entityType: "RequirementProgress",
            entityId: row.id,
            action: item.status === "signed_off" ? "sign_off" : "undo_sign_off",
            summary: `${item.requirementId} ${fromStatus ?? "none"} → ${item.status}`,
          },
        });
      }
    }
  });

  return json(await progressBody(scout, rel));
});
