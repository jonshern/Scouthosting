// A scout's whole Lantern trail as a file the family keeps: the steps
// checked, the order of the trail, their own steps, and every log, note
// and photo. Three downloads, all from the same data:
//
//   json  the trail file (lantern-trail v1), photos listed but not included
//   xlsx  the same thing as a spreadsheet anyone can open
//   zip   trail.json + trail.xlsx + photos/, the complete copy
//
// Importing a trail file (json or zip) either makes a new scout or adds
// what's missing to one the account already has. It never unchecks a
// step or overwrites an entry, so importing an old copy can't lose
// anything newer. Lantern on a phone with no account writes the same
// format (source "lantern-device"), so a phone-only trail imports too.

import crypto from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, badRequest } from "@/lib/api/v1";
import { del, get, put } from "@/lib/storage";
import { EXT_BY_MIME, sniffImageType } from "@/lib/api/image-type";
import { itemIndex, itemName, loadCatalog, type CatalogItem } from "@/lib/mcp/catalog";
import { decryptEntryPhoto, decryptScoutName, encryptEntryPhoto, encryptEntryText } from "./crypto";
import { listEntries, type ScoutRef } from "./entries";
import { createScout, getScout } from "./store";
import {
  ClientId,
  Custom,
  CustomItem,
  DoneOn,
  ENTRY_UNITS,
  ItemKey,
  MAX_CUSTOM_ITEMS,
  MAX_ENTRIES_PER_SCOUT,
  MAX_ENTRY_TEXT,
  MAX_PATH,
  MAX_PROGRESS_CHANGES,
  ProgressKey,
  ScoutName,
} from "./schema";
import { BadZip, unzip, zip } from "./zip";
import { xlsx, type Cell } from "./xlsx";

export const TRAIL_FORMAT = "lantern-trail";
export const TRAIL_VERSION = 1;
/** Biggest import accepted: a zip with a few hundred photos. */
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export type TrailEntry = {
  id: string;
  key: string;
  kind: string;
  day: string | null;
  amount: number | null;
  unit: string | null;
  text: string | null;
  by: string;
  createdAt: string;
  updatedAt: string;
  photo: { file: string; mimeType: string } | null;
};

export type TrailFile = {
  format: typeof TRAIL_FORMAT;
  version: typeof TRAIL_VERSION;
  exportedAt: string;
  source: "compass" | "lantern-device";
  scout: {
    id: string | null;
    name: string;
    path: string[];
    custom: Record<string, unknown>;
    progress: Record<string, string | true>;
    checkedBy: Record<string, "scout">;
  };
  entries: TrailEntry[];
};

type Owner = { id: string; email: string };

/** The account's scout as a trail file, with the photo bytes to go alongside it. */
export async function exportTrail(
  user: Owner,
  scoutId: string,
  opts: { photos: boolean } = { photos: false },
): Promise<{ file: TrailFile; photos: Map<string, Buffer> }> {
  const scout = await getScout(user, scoutId);
  const ref: ScoutRef = { id: scout.id, ownerUserId: user.id };
  const rows = await prisma.journeyEntry.findMany({
    where: { scoutId: scout.id, fileKey: { not: null } },
    select: { clientId: true, fileKey: true, mimeType: true },
  });
  const photoRows = new Map(rows.map((r) => [r.clientId, r]));
  const photos = new Map<string, Buffer>();
  const entries: TrailEntry[] = [];
  for (const e of await listEntries(ref)) {
    const row = photoRows.get(e.id);
    let photo: TrailEntry["photo"] = null;
    if (row?.fileKey) {
      const mimeType = row.mimeType ?? "image/jpeg";
      const ext = EXT_BY_MIME[mimeType as keyof typeof EXT_BY_MIME] ?? ".bin";
      photo = { file: `photos/${e.id}${ext}`, mimeType };
      if (opts.photos) {
        try {
          photos.set(photo.file, decryptEntryPhoto(user.id, await get(row.fileKey)));
        } catch {
          // A photo file that's gone missing shouldn't stop the rest of the copy.
          photo = null;
        }
      }
    }
    entries.push({
      id: e.id,
      key: e.key,
      kind: e.kind,
      day: e.day,
      amount: e.amount,
      unit: e.unit,
      text: e.text,
      by: e.by,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      photo,
    });
  }
  return {
    file: {
      format: TRAIL_FORMAT,
      version: TRAIL_VERSION,
      exportedAt: new Date().toISOString(),
      source: "compass",
      scout: {
        id: scout.id,
        name: scout.name,
        path: scout.path,
        custom: scout.custom,
        progress: scout.progress,
        checkedBy: scout.checkedBy,
      },
      entries,
    },
    photos,
  };
}

/** "Emmett" → "emmett-trail-2026-10-17". */
export function trailFileName(name: string, when = new Date()): string {
  const slug = (name || "scout").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "scout";
  return `${slug}-trail-${when.toISOString().slice(0, 10)}`;
}

// ---------------------------------------------------------------------
// The spreadsheet.

type Req = { n: string; t: string; subs: { id: string; t: string }[] };

/** Each requirement's step key and words, numbered the way Lantern numbers them (repeats get "~2"). */
export function stepsOf(item: { reqs: Req[] }): { key: string; id: string; text: string }[] {
  const out: { key: string; id: string; text: string }[] = [];
  const seen: Record<string, number> = {};
  const push = (id: string, text: string) => {
    const n = (seen[id] = (seen[id] ?? 0) + 1);
    out.push({ id, key: n === 1 ? id : `${id}~${n}`, text });
  };
  for (const r of item.reqs) {
    if (r.subs.length) r.subs.forEach((s) => push(s.id, s.t));
    else push(r.n, r.t);
  }
  return out;
}

const KIND_LABEL: Record<string, string> = { rank: "Rank", badge: "Merit badge", award: "Award", custom: "Own steps" };
const ENTRY_LABEL: Record<string, string> = { log: "Log", note: "Note", photo: "Photo", ready: "Ready to check" };

export function trailSheets(file: TrailFile, catalog: Map<string, CatalogItem> = itemIndex(loadCatalog())) {
  const { scout } = file;
  const custom = scout.custom as Record<string, CatalogItem>;
  const lookup = (key: string): CatalogItem | undefined => custom[key] ?? catalog.get(key);
  const name = (key: string) => custom[key]?.name ?? itemName(key, catalog);
  const by = (k: string) => (scout.checkedBy[k] === "scout" ? scout.name || "Scout" : "Grown-up");
  const day = (v: string | true | undefined) => (typeof v === "string" ? v : v ? "yes" : "");

  const trail: Cell[][] = [["#", "Rank or badge", "Type", "Status", "Steps done", "Steps in all"]];
  const steps: Cell[][] = [["Rank or badge", "Requirement", "What it says", "Done", "Checked by"]];
  scout.path.forEach((key, i) => {
    const item = lookup(key);
    const list = item ? stepsOf(item) : [];
    const doneKeys = Object.keys(scout.progress).filter((k) => k.startsWith(`${key}#`));
    const earned = scout.progress[key] !== undefined;
    const done = list.length ? list.filter((s) => scout.progress[`${key}#${s.key}`]).length : doneKeys.length;
    const status = earned || (list.length > 0 && done === list.length) ? "Earned" : done ? "In progress" : "Not started";
    trail.push([i + 1, name(key), KIND_LABEL[key.split(":")[0]] ?? "", earned && typeof scout.progress[key] === "string" ? `Earned ${scout.progress[key]}` : status, done, list.length || null]);
    if (list.length) {
      for (const s of list) {
        const v = scout.progress[`${key}#${s.key}`];
        steps.push([name(key), s.id, s.text, day(v) || (earned ? "earned" : ""), v ? by(`${key}#${s.key}`) : ""]);
      }
    } else {
      // No catalog here to list every step: show the ones checked.
      for (const k of doneKeys.sort()) steps.push([name(key), k.slice(key.length + 1), "", day(scout.progress[k]), by(k)]);
    }
  });

  const log: Cell[][] = [["Date", "Rank or badge", "Requirement", "Type", "Amount", "Unit", "Note", "Photo", "By"]];
  for (const e of file.entries) {
    const [item, step = ""] = e.key.split("#");
    log.push([
      e.day ?? e.createdAt.slice(0, 10),
      name(item),
      step,
      ENTRY_LABEL[e.kind] ?? e.kind,
      e.amount,
      e.unit,
      e.text,
      e.photo ? e.photo.file : "",
      e.by === "scout" ? scout.name || "Scout" : "Grown-up",
    ]);
  }

  const about: Cell[][] = [
    ["About this file", ""],
    ["Scout", scout.name],
    ["Saved", file.exportedAt.slice(0, 16).replace("T", " ") + " UTC"],
    ["Steps checked", Object.keys(scout.progress).length],
    ["Logs, notes and photos", file.entries.length],
    ["To put it back", "Compass → Account → Lantern trails → Import, using the .json or .zip from the same download."],
  ];
  return [
    { name: "Trail", widths: [5, 34, 13, 18, 11, 12], rows: trail },
    { name: "Steps", widths: [30, 12, 70, 12, 14], rows: steps },
    { name: "Logs and notes", widths: [12, 30, 12, 14, 9, 9, 60, 24, 12], rows: log },
    { name: "About", widths: [24, 80], rows: about },
  ];
}

export function trailXlsx(file: TrailFile): Buffer {
  return xlsx(trailSheets(file));
}

export function trailZip(file: TrailFile, photos: Map<string, Buffer>): Buffer {
  return zip([
    { name: "trail.json", data: Buffer.from(JSON.stringify(file, null, 2)) },
    { name: "trail.xlsx", data: trailXlsx(file), store: true },
    // Photos are already compressed.
    ...[...photos].map(([name, data]) => ({ name, data, store: true })),
  ]);
}

// ---------------------------------------------------------------------
// Reading a file back.

const FileShape = z.object({
  format: z.literal(TRAIL_FORMAT),
  version: z.literal(TRAIL_VERSION),
  scout: z.object({
    name: z.string().optional(),
    path: z.array(z.unknown()).max(MAX_PATH * 2).default([]),
    custom: z.record(z.unknown()).default({}),
    progress: z.record(z.unknown()).default({}),
    checkedBy: z.record(z.unknown()).default({}),
  }),
  entries: z.array(z.unknown()).max(MAX_ENTRIES_PER_SCOUT).default([]),
});

const ImportEntry = z.object({
  id: ClientId,
  key: ProgressKey,
  kind: z.enum(["log", "note", "ready", "photo"]),
  day: DoneOn.nullish(),
  amount: z.number().finite().min(0).max(100_000).nullish(),
  unit: z.enum(ENTRY_UNITS).nullish(),
  text: z.string().max(MAX_ENTRY_TEXT).nullish(),
  by: z.enum(["parent", "scout"]).catch("parent"),
  createdAt: z.string().datetime({ offset: true }).nullish().catch(null),
  photo: z.object({ file: z.string().max(200), mimeType: z.string().max(40).optional() }).nullish().catch(null),
});

export type ParsedTrail = {
  name: string;
  path: string[];
  custom: Record<string, z.infer<typeof CustomItem>>;
  progress: Record<string, string | true>;
  byScout: Set<string>;
  entries: (z.infer<typeof ImportEntry> & { photoBytes?: Buffer; photoMime?: keyof typeof EXT_BY_MIME })[];
  /** Parts of the file that couldn't be read and were left out. */
  skipped: number;
};

const bad = () => badRequest("bad_file");

/**
 * Reads a trail file: the JSON itself, or a zip with trail.json (and
 * photos/) inside, which is what the "everything" download is. Parts it
 * can't read are counted and left out; a file that isn't a trail at all
 * is a 400 bad_file.
 */
export function parseTrailUpload(body: Buffer): ParsedTrail {
  let json: unknown;
  let files: Map<string, Buffer> | null = null;
  if (body.length >= 4 && body.readUInt32LE(0) === 0x04034b50) {
    try {
      files = unzip(body, { maxFiles: MAX_ENTRIES_PER_SCOUT + 10, maxBytes: MAX_IMPORT_BYTES * 2 });
    } catch (e) {
      if (e instanceof BadZip) throw bad();
      throw e;
    }
    // trail.json at the top, or one folder down when the zip was re-made by hand.
    const name = [...files.keys()].filter((n) => /(^|\/)trail\.json$/.test(n)).sort((a, b) => a.length - b.length)[0];
    if (!name) throw bad();
    const prefix = name.slice(0, -"trail.json".length);
    if (prefix) files = new Map([...files].filter(([n]) => n.startsWith(prefix)).map(([n, d]) => [n.slice(prefix.length), d]));
    json = safeJson(files.get("trail.json")!);
  } else {
    json = safeJson(body);
  }
  const shape = FileShape.safeParse(json);
  if (!shape.success) throw bad();
  const s = shape.data.scout;
  let skipped = 0;

  const name = ScoutName.safeParse(s.name ?? "");
  const path: string[] = [];
  for (const k of s.path) {
    if (ItemKey.safeParse(k).success && !path.includes(k as string) && path.length < MAX_PATH) path.push(k as string);
    else skipped++;
  }

  const custom: ParsedTrail["custom"] = {};
  for (const [k, v] of Object.entries(s.custom)) {
    const item = CustomItem.safeParse(v);
    if (item.success && item.data.key === k && Object.keys(custom).length < MAX_CUSTOM_ITEMS) custom[k] = item.data;
    else skipped++;
  }

  const progress: Record<string, string | true> = {};
  for (const [k, v] of Object.entries(s.progress)) {
    const okValue = v === true || DoneOn.safeParse(v).success;
    if (ProgressKey.safeParse(k).success && okValue && Object.keys(progress).length < MAX_PROGRESS_CHANGES) progress[k] = v as string | true;
    else skipped++;
  }
  const byScout = new Set(Object.entries(s.checkedBy).filter(([k, v]) => v === "scout" && progress[k] !== undefined).map(([k]) => k));

  const entries: ParsedTrail["entries"] = [];
  const ids = new Set<string>();
  for (const raw of shape.data.entries) {
    const e = ImportEntry.safeParse(raw);
    if (!e.success || ids.has(e.data.id) || (e.data.kind === "log" && e.data.amount == null)) {
      skipped++;
      continue;
    }
    const entry: ParsedTrail["entries"][number] = e.data;
    if (e.data.kind === "photo") {
      const bytes = e.data.photo?.file ? files?.get(e.data.photo.file) : undefined;
      const mime = bytes ? sniffImageType(bytes) : null;
      if (!bytes || !mime || bytes.length > MAX_PHOTO_BYTES) {
        // A photo entry without its photo (the plain .json download) keeps its words as a note.
        if (!e.data.text) {
          skipped++;
          continue;
        }
        entry.kind = "note";
      } else {
        entry.photoBytes = bytes;
        entry.photoMime = mime;
      }
    }
    ids.add(e.data.id);
    entries.push(entry);
  }
  return { name: name.success ? name.data : "Scout", path, custom, progress, byScout, entries, skipped };
}

function safeJson(buf: Buffer): unknown {
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    throw bad();
  }
}

export type ImportResult = {
  scout: Awaited<ReturnType<typeof getScout>>;
  imported: { steps: number; entries: number; photos: number; skipped: number };
};

/**
 * Puts a parsed trail on the account: as a new scout, or (into) added to
 * one it already has. Adds only what's missing.
 */
export async function importTrail(user: Owner, t: ParsedTrail, into?: string): Promise<ImportResult> {
  let scoutId: string;
  let skipped = t.skipped;
  let steps = 0;
  if (into) {
    const target = await getScout(user, into);
    scoutId = target.id;
    const path = [...target.path];
    for (const k of t.path) if (!path.includes(k) && path.length < MAX_PATH) path.push(k);
    const custom = { ...(target.custom as Record<string, unknown>) };
    for (const [k, v] of Object.entries(t.custom)) {
      if (!(k in custom) && Object.keys(custom).length < MAX_CUSTOM_ITEMS) custom[k] = v;
    }
    if (!Custom.safeParse(custom).success) throw badRequest("bad_file");
    const fresh = Object.entries(t.progress).filter(([k]) => target.progress[k] === undefined);
    skipped += Object.keys(t.progress).length - fresh.length;
    if (Object.keys(target.progress).length + fresh.length > MAX_PROGRESS_CHANGES) throw new ApiError(409, "too_many_steps");
    await prisma.$transaction(async (tx) => {
      await tx.journeyScout.update({ where: { id: scoutId }, data: { path, custom: custom as Prisma.InputJsonValue } });
      if (fresh.length) {
        const { count } = await tx.journeyProgress.createMany({
          data: fresh.map(([key, on]) => ({ scoutId, key, doneOn: on === true ? null : on, byScout: t.byScout.has(key) })),
          skipDuplicates: true,
        });
        steps = count;
      }
    });
  } else {
    const created = await createScout(user, { name: t.name, path: t.path, custom: t.custom, progress: t.progress });
    scoutId = created.id;
    steps = Object.keys(t.progress).length;
    if (t.byScout.size) {
      await prisma.journeyProgress.updateMany({ where: { scoutId, key: { in: [...t.byScout] } }, data: { byScout: true } });
    }
  }

  const have = new Set(
    (await prisma.journeyEntry.findMany({ where: { scoutId }, select: { clientId: true } })).map((r) => r.clientId),
  );
  const fresh = t.entries.filter((e) => !have.has(e.id));
  skipped += t.entries.length - fresh.length;
  if (have.size + fresh.length > MAX_ENTRIES_PER_SCOUT) throw new ApiError(409, "too_many_entries");

  // Photos go to storage first; if saving the rows fails, they're removed again.
  const written: string[] = [];
  let photos = 0;
  try {
    const rows: Prisma.JourneyEntryCreateManyInput[] = [];
    for (const e of fresh) {
      let fileKey: string | null = null;
      if (e.photoBytes && e.photoMime) {
        fileKey = `journey/${scoutId}/${crypto.randomBytes(12).toString("hex")}${EXT_BY_MIME[e.photoMime]}`;
        await put(fileKey, encryptEntryPhoto(user.id, e.photoBytes));
        written.push(fileKey);
        photos++;
      }
      rows.push({
        scoutId,
        clientId: e.id,
        key: e.key,
        kind: e.kind,
        day: e.day ?? null,
        amount: e.amount ?? null,
        unit: e.unit ?? null,
        encText: encryptEntryText(user.id, e.text?.trim() || undefined),
        fileKey,
        mimeType: fileKey ? e.photoMime : null,
        byUserId: e.by === "parent" ? user.id : null,
        byRole: e.by,
        ...(e.createdAt ? { createdAt: new Date(e.createdAt) } : {}),
      });
    }
    if (rows.length) await prisma.journeyEntry.createMany({ data: rows, skipDuplicates: true });
  } catch (err) {
    await Promise.all(written.map((k) => del(k).catch(() => {})));
    throw err;
  }
  await prisma.journeyScout.update({ where: { id: scoutId }, data: { updatedAt: new Date() } });
  return { scout: await getScout(user, scoutId), imported: { steps, entries: fresh.length, photos, skipped } };
}

/** For the account page: each scout's name, for the download list. */
export async function scoutNames(user: Owner): Promise<{ id: string; name: string; steps: number; entries: number }[]> {
  const rows = await prisma.journeyScout.findMany({
    where: { ownerUserId: user.id },
    select: { id: true, encName: true, _count: { select: { progress: true, entries: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: decryptScoutName(user.id, r.encName),
    steps: r._count.progress,
    entries: r._count.entries,
  }));
}

/** The download for one format: body, content type and file name. */
export async function trailDownload(user: Owner, scoutId: string, format: "json" | "xlsx" | "zip") {
  const { file, photos } = await exportTrail(user, scoutId, { photos: format === "zip" });
  const base = trailFileName(file.scout.name);
  if (format === "xlsx") {
    return {
      body: trailXlsx(file),
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      name: `${base}.xlsx`,
    };
  }
  if (format === "zip") return { body: trailZip(file, photos), type: "application/zip", name: `${base}.zip` };
  return { body: Buffer.from(JSON.stringify(file, null, 2)), type: "application/json", name: `${base}.json` };
}

export function downloadResponse(d: { body: Buffer; type: string; name: string }): Response {
  return new Response(new Uint8Array(d.body), {
    headers: {
      "content-type": d.type,
      "content-disposition": `attachment; filename="${d.name}"`,
      "cache-control": "private, no-store",
    },
  });
}

/** The uploaded file: the request body itself, or a "file" part of a form. */
export async function readTrailUpload(req: Request): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_IMPORT_BYTES + 64 * 1024) throw new ApiError(413, "too_large");
  let body: Buffer;
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw badRequest("no_file");
    if (file.size > MAX_IMPORT_BYTES) throw new ApiError(413, "too_large");
    body = Buffer.from(await file.arrayBuffer());
  } else {
    body = Buffer.from(await req.arrayBuffer().catch(() => new ArrayBuffer(0)));
  }
  if (body.length > MAX_IMPORT_BYTES) throw new ApiError(413, "too_large");
  if (!body.length) throw badRequest("no_file");
  return body;
}
