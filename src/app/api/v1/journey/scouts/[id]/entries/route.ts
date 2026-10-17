// GET  /api/v1/journey/scouts/[id]/entries[?key=badge:camping] — the
//      scout's logs, notes, photos and "ready" marks: { entries: [{ id,
//      key, kind, day, amount, unit, text, photo, by, createdAt,
//      updatedAt }] }. id is the device's clientId.
// POST /api/v1/journey/scouts/[id]/entries — body { put: [{ clientId,
//      key, kind: "log" | "note" | "ready", day?, amount?, unit?, text? }],
//      remove: [clientId] }: adds or replaces entries by clientId and
//      removes others, all or nothing. Returns every entry, like GET.
//
// Photos go up one at a time on entries/photo (multipart). The CSV is
// entries/export. Only the account that added the scout sees it.

import { LIMITS, json, parseId, readJson, readQuery, v1Route } from "@/lib/api/v1";
import { EntriesBody, EntriesQuery } from "@/lib/journey/schema";
import { applyEntries, listEntries, ownedScoutRef } from "@/lib/journey/entries";

export const runtime = "nodejs";

export const GET = v1Route<{ id: string }>(async (req, { user, params }) => {
  const ref = await ownedScoutRef(user, parseId(params.id));
  const { key } = readQuery(req, EntriesQuery);
  return json({ entries: await listEntries(ref, key) });
});

export const POST = v1Route<{ id: string }>(
  async (req, { user, params }) => {
    const ref = await ownedScoutRef(user, parseId(params.id));
    const body = await readJson(req, EntriesBody);
    return json({ entries: await applyEntries(ref, { userId: user.id, role: "parent" }, body) });
  },
  { limits: [LIMITS.journey] },
);
