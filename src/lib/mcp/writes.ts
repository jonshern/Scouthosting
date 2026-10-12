// The connector's two write actions. Both run only after the adult has
// said yes in the chat (the tool is called with confirm: true, see
// lib/mcp/server.ts), and both stay inside what the same adult could do
// from the phone app:
//
//   setRequirementStatus  not_started / in_progress / done, the way a
//       family tracks progress through PUT /api/v1/scouts/:id/progress.
//       Never signs off and never touches a signed-off requirement,
//       even for a leader: sign-offs happen in Compass or Waypoint.
//       A scout followed only in Lantern has no troop record; there
//       "done" checks the step on the adult's Lantern trail (today's
//       date) and "not_started" unchecks it, as the Lantern app would.
//   rsvpForEvent  the adult's own RSVP (lib/rsvp/submit.ts), same as
//       POST /api/v1/events/:id/rsvp.

import { prisma } from "@/lib/db";
import { requireOrgAccessForResource } from "@/lib/api/v1";
import { REQUIREMENT_ID_PATTERN } from "@/lib/counselor/ids";
import { applyProgress } from "@/lib/journey/store";
import { submitOwnRsvp } from "@/lib/rsvp/submit";
import { itemIndex, loadCatalog, type CatalogItem } from "./catalog";
import { inTroop } from "./scout-data";
import type { AccessibleScout, McpUser } from "./scouts";

export type TrackStatus = "not_started" | "in_progress" | "done";

export class WriteRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteRefused";
  }
}

const CUSTOM_REQUIREMENT_PATTERN = /^custom:[a-z0-9]+(?:-[a-z0-9]+)*#[0-9A-Za-z][0-9A-Za-z.~-]*$/;

/**
 * Does the catalog (when loaded) know this requirement id? `custom`
 * holds the family's own Lantern items, whose ids look like
 * custom:<id>#2.
 */
export function requirementKnown(
  requirementId: string,
  custom: Record<string, CatalogItem> = {},
): { ok: true; text: string | null } | { ok: false; reason: string } {
  const isCustom = CUSTOM_REQUIREMENT_PATTERN.test(requirementId);
  if (!REQUIREMENT_ID_PATTERN.test(requirementId) && !isCustom) {
    return { ok: false, reason: `"${requirementId}" isn't a requirement id. They look like badge:first-aid#3 or rank:tenderfoot#4a.` };
  }
  const catalog = loadCatalog();
  if (!catalog && !isCustom) return { ok: true, text: null };
  const [item, n] = requirementId.split("#");
  const found = isCustom ? custom[item] : itemIndex(catalog).get(item);
  if (!found) return { ok: false, reason: `No rank or badge called ${item}.` };
  const req = found.reqs.flatMap((r) => (r.subs.length ? r.subs.map((s) => ({ id: s.id, t: s.t })) : [{ id: r.n, t: r.t }])).find((r) => r.id === n);
  if (!req) return { ok: false, reason: `${found.name} has no requirement ${n}.` };
  return { ok: true, text: req.t };
}

export async function setRequirementStatus(
  user: McpUser,
  scout: AccessibleScout,
  requirementId: string,
  status: TrackStatus,
  note: string | null,
  custom: Record<string, CatalogItem> = {},
): Promise<{ changed: boolean; from: string | null; to: string; where: "troop" | "lantern" }> {
  const known = requirementKnown(requirementId, custom);
  if (!known.ok) throw new WriteRefused(known.reason);
  if (!inTroop(scout) || requirementId.startsWith("custom:")) return setLanternCheck(user, scout, requirementId, status);
  // Membership and a non-suspended org, as the API's PUT requires.
  await requireOrgAccessForResource(scout.orgId, user.id, { write: true });

  return prisma.$transaction(async (tx) => {
    const prev = await tx.requirementProgress.findUnique({
      where: { memberId_requirementId: { memberId: scout.memberId, requirementId } },
    });
    if (prev?.status === "signed_off") {
      throw new WriteRefused("That requirement is already signed off. Changing a sign-off has to happen in Compass or Waypoint.");
    }
    const nextNote = note === null ? (prev?.note ?? null) : note.trim() || null;
    if (prev && prev.status === status && prev.note === nextNote) return { changed: false, from: prev.status as string, to: status, where: "troop" };

    await tx.requirementProgress.upsert({
      where: { memberId_requirementId: { memberId: scout.memberId, requirementId } },
      create: { orgId: scout.orgId, memberId: scout.memberId, requirementId, status, note: nextNote, updatedById: user.id },
      update: { status, note: nextNote, updatedById: user.id, signedOffById: null, signedOffAt: null },
    });
    await tx.requirementProgressEvent.create({
      data: {
        orgId: scout.orgId,
        memberId: scout.memberId,
        requirementId,
        fromStatus: prev?.status ?? null,
        toStatus: status,
        note: nextNote,
        actorUserId: user.id,
      },
    });
    return { changed: true, from: prev?.status ?? null, to: status, where: "troop" };
  });
}

/** Check or uncheck a step on the adult's own Lantern trail. */
async function setLanternCheck(user: McpUser, scout: AccessibleScout, key: string, status: TrackStatus) {
  if (!scout.journeyId) throw new WriteRefused("This scout has no record to save progress to.");
  if (status === "in_progress") {
    throw new WriteRefused("Lantern only tracks steps as checked or not, so there's no \"in progress\". Mark it done or not started.");
  }
  const existing = await prisma.journeyProgress.findUnique({
    where: { scoutId_key: { scoutId: scout.journeyId, key } },
    select: { id: true },
  });
  const from = existing ? "done" : "not_started";
  if (from === status) return { changed: false, from, to: status, where: "lantern" as const };
  const today = new Date().toISOString().slice(0, 10);
  await applyProgress(user, scout.journeyId, [status === "done" ? { key, done: true, on: today } : { key, done: false }]);
  return { changed: true, from, to: status, where: "lantern" as const };
}


export async function rsvpForEvent(
  user: McpUser,
  event: { id: string; orgId: string },
  response: "yes" | "no" | "maybe",
  guests: number,
  notes: string | null,
) {
  await requireOrgAccessForResource(event.orgId, user.id, { write: true });
  return submitOwnRsvp(user, event, { response, guests, notes });
}
