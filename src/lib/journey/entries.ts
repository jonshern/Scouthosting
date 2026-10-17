// Lantern journey entries: logs, notes, photos and "ready" marks on a
// scout's requirements (JourneyEntry). The routes resolve which scout
// the caller may write to and who they are; everything here takes that
// as a ScoutRef and a Who, so the account's routes and the scout
// device's routes share it.

import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { ApiError, notFound } from "@/lib/api/v1";
import { del, get, put } from "@/lib/storage";
import { EXT_BY_MIME, type ImageMime } from "@/lib/api/image-type";
import { decryptEntryPhoto, decryptEntryText, decryptScoutName, encryptEntryPhoto, encryptEntryText } from "./crypto";
import { MAX_ENTRIES_PER_SCOUT, type EntryInputT } from "./schema";

/** The scout being written to, and the account that owns it (whose key encrypts the entries). */
export type ScoutRef = { id: string; ownerUserId: string };
/** Who is making the change. */
export type Who = { userId: string | null; role: "parent" | "scout" };

/** The account's own scout, or 404 (someone else's scout looks like no scout). */
export async function ownedScoutRef(user: { id: string }, id: string): Promise<ScoutRef> {
  const row = await prisma.journeyScout.findFirst({
    where: { id, ownerUserId: user.id },
    select: { id: true, ownerUserId: true },
  });
  if (!row) throw notFound();
  return row;
}

const ENTRY_SELECT = {
  clientId: true,
  key: true,
  kind: true,
  day: true,
  amount: true,
  unit: true,
  encText: true,
  fileKey: true,
  mimeType: true,
  byRole: true,
  createdAt: true,
  updatedAt: true,
} as const;

type EntryRow = {
  clientId: string;
  key: string;
  kind: string;
  day: string | null;
  amount: number | null;
  unit: string | null;
  encText: Uint8Array | null;
  fileKey: string | null;
  mimeType: string | null;
  byRole: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Entry = {
  id: string;
  key: string;
  kind: string;
  day: string | null;
  amount: number | null;
  unit: string | null;
  text: string | null;
  photo: boolean;
  by: string;
  createdAt: string;
  updatedAt: string;
};

function view(ref: ScoutRef, r: EntryRow): Entry {
  return {
    id: r.clientId,
    key: r.key,
    kind: r.kind,
    day: r.day,
    amount: r.amount,
    unit: r.unit,
    text: decryptEntryText(ref.ownerUserId, r.encText),
    photo: !!r.fileKey,
    by: r.byRole,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** "badge:camping" matches every step of the badge; "badge:camping#9a" only that step. */
function keyFilter(key?: string) {
  if (!key) return {};
  if (key.includes("#")) return { key };
  return { OR: [{ key }, { key: { startsWith: `${key}#` } }] };
}

export async function listEntries(ref: ScoutRef, key?: string): Promise<Entry[]> {
  const rows = await prisma.journeyEntry.findMany({
    where: { scoutId: ref.id, ...keyFilter(key) },
    select: ENTRY_SELECT,
    orderBy: [{ day: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => view(ref, r));
}

/**
 * Adds or replaces entries by the device's clientId and removes others,
 * all or nothing. Removing an id that isn't there is fine (the device may
 * retry a batch that already went through).
 */
export async function applyEntries(
  ref: ScoutRef,
  who: Who,
  body: { put: EntryInputT[]; remove: string[] },
): Promise<Entry[]> {
  const photosToDelete: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`journey-entries:${ref.id}`}))`;
    if (body.remove.length) {
      const gone = await tx.journeyEntry.findMany({
        where: { scoutId: ref.id, clientId: { in: body.remove }, fileKey: { not: null } },
        select: { fileKey: true },
      });
      photosToDelete.push(...gone.map((g) => g.fileKey!));
      await tx.journeyEntry.deleteMany({ where: { scoutId: ref.id, clientId: { in: body.remove } } });
    }
    // Last write per clientId wins within a batch.
    const byId = new Map(body.put.map((e) => [e.clientId, e]));
    for (const e of byId.values()) {
      const data = {
        key: e.key,
        kind: e.kind,
        day: e.day ?? null,
        amount: e.amount ?? null,
        unit: e.unit ?? null,
        encText: encryptEntryText(ref.ownerUserId, e.text?.trim() || undefined),
      };
      await tx.journeyEntry.upsert({
        where: { scoutId_clientId: { scoutId: ref.id, clientId: e.clientId } },
        create: { ...data, scoutId: ref.id, clientId: e.clientId, byUserId: who.userId, byRole: who.role },
        // A photo entry keeps its photo when its note or day is edited.
        update: data,
      });
    }
    const count = await tx.journeyEntry.count({ where: { scoutId: ref.id } });
    if (count > MAX_ENTRIES_PER_SCOUT) throw new ApiError(409, "too_many_entries");
    await tx.journeyScout.update({ where: { id: ref.id }, data: { updatedAt: new Date() } });
  });
  await Promise.all(photosToDelete.map((k) => del(k).catch(() => {})));
  return listEntries(ref);
}

export async function addPhotoEntry(
  ref: ScoutRef,
  who: Who,
  e: { clientId: string; key: string; day?: string; text?: string },
  bytes: Buffer,
  mimeType: ImageMime,
): Promise<Entry> {
  const existing = await prisma.journeyEntry.findUnique({
    where: { scoutId_clientId: { scoutId: ref.id, clientId: e.clientId } },
    select: { fileKey: true },
  });
  // Already uploaded (a retry): keep the first upload.
  if (existing?.fileKey) {
    const row = await prisma.journeyEntry.findUniqueOrThrow({
      where: { scoutId_clientId: { scoutId: ref.id, clientId: e.clientId } },
      select: ENTRY_SELECT,
    });
    return view(ref, row);
  }
  const count = await prisma.journeyEntry.count({ where: { scoutId: ref.id } });
  if (count >= MAX_ENTRIES_PER_SCOUT) throw new ApiError(409, "too_many_entries");
  const fileKey = `journey/${ref.id}/${crypto.randomBytes(12).toString("hex")}${EXT_BY_MIME[mimeType]}`;
  await put(fileKey, encryptEntryPhoto(ref.ownerUserId, bytes));
  const data = {
    key: e.key,
    kind: "photo",
    day: e.day ?? null,
    encText: encryptEntryText(ref.ownerUserId, e.text?.trim() || undefined),
    fileKey,
    mimeType,
  };
  const row = await prisma.journeyEntry.upsert({
    where: { scoutId_clientId: { scoutId: ref.id, clientId: e.clientId } },
    create: { ...data, scoutId: ref.id, clientId: e.clientId, byUserId: who.userId, byRole: who.role },
    update: data,
    select: ENTRY_SELECT,
  });
  await prisma.journeyScout.update({ where: { id: ref.id }, data: { updatedAt: new Date() } });
  return view(ref, row);
}

export async function readPhoto(ref: ScoutRef, clientId: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const row = await prisma.journeyEntry.findUnique({
    where: { scoutId_clientId: { scoutId: ref.id, clientId } },
    select: { fileKey: true, mimeType: true },
  });
  if (!row?.fileKey) throw notFound();
  const blob = await get(row.fileKey);
  return { bytes: decryptEntryPhoto(ref.ownerUserId, blob), mimeType: row.mimeType ?? "application/octet-stream" };
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Every entry as CSV, for the spreadsheet export. */
export async function entriesCsv(ref: ScoutRef, key?: string): Promise<{ csv: string; name: string }> {
  const scout = await prisma.journeyScout.findUniqueOrThrow({ where: { id: ref.id }, select: { encName: true } });
  const name = decryptScoutName(ref.ownerUserId, scout.encName);
  const entries = await listEntries(ref, key);
  const rows = [["Scout", "Requirement", "Date", "Type", "Amount", "Unit", "Note", "Photo", "Logged by"]];
  for (const e of entries) {
    rows.push([
      name,
      e.key,
      e.day ?? e.createdAt.slice(0, 10),
      e.kind,
      e.amount == null ? "" : String(e.amount),
      e.unit ?? "",
      e.text ?? "",
      e.photo ? "yes" : "",
      e.by,
    ]);
  }
  return { csv: rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n", name };
}
