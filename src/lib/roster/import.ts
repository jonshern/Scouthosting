// Roster import — parses CSV / XLSX bytes into a normalised matrix
// of row arrays (header row first), then maps each data row into a
// Member-shaped DTO ready for prisma.member.createMany.

import { readSheet } from "read-excel-file/node";

export type RosterRow = {
  orgId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  patrol: string | null;
  position: string | null;
  isYouth: boolean;
  commPreference: "email" | "sms" | "both" | "none";
  smsOptIn: boolean;
  skills: string[];
  interests: string[];
  notes: string | null;
};

export async function parseRoster(args: {
  buffer?: Buffer | null;
  filename?: string | null;
  text?: string | null;
}): Promise<string[][]> {
  const fmt = detectFormat(args);
  if (fmt === "csv") {
    const src = args.text || (args.buffer && args.buffer.toString("utf8")) || "";
    return parseCsv(src);
  }
  if (fmt === "xlsx") {
    if (!args.buffer) throw new Error("XLSX import requires the uploaded file (no paste path).");
    return parseXlsx(args.buffer);
  }
  throw new Error(`Unsupported roster format: ${fmt}`);
}

function detectFormat(args: {
  filename?: string | null;
  text?: string | null;
  buffer?: Buffer | null;
}): "csv" | "xlsx" | "unknown" {
  const ext = String(args.filename || "").toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "txt") return "csv";
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") return "xlsx";
  if (args.buffer && args.buffer.length >= 2 && args.buffer[0] === 0x50 && args.buffer[1] === 0x4b)
    return "xlsx";
  if (args.text || args.buffer) return "csv";
  return "unknown";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n") {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else if (c === "\r") {
        // skip
      } else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

// .xlsx only. SheetJS ("xlsx" on npm) was dropped: the npm release has
// unfixed prototype-pollution and ReDoS advisories and newer builds are
// only published off-registry. Legacy binary .xls files aren't read.
export async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  let rows: unknown[][];
  try {
    rows = (await readSheet(buffer, 1)) as unknown[][];
  } catch {
    throw new Error("Couldn't read that spreadsheet. Save it as .xlsx or .csv and try again.");
  }
  return rows
    .map((row) => row.map(cellToString))
    .filter((row) => row.some((c) => c !== ""));
}

function cellToString(cell: unknown): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell);
}

function normaliseHeader(s: string): string {
  return String(s || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function splitMulti(s: string | null | undefined): string[] {
  if (!s) return [];
  return String(s)
    .split(/[;|,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function mapMemberRows(args: { rows: string[][]; orgId: string }): RosterRow[] {
  const { rows, orgId } = args;
  if (!rows.length) return [];
  const header = rows[0].map((h) => normaliseHeader(h));
  const idx = (k: string) => header.indexOf(normaliseHeader(k));
  const truthy = (v: string) => /^(1|true|yes|y)$/i.test(String(v || "").trim());

  const out: RosterRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (...keys: string[]): string => {
      for (const k of keys) {
        const i = idx(k);
        if (i >= 0) return (row[i] ?? "").trim();
      }
      return "";
    };
    const firstName = get("firstName", "first_name", "first", "firstname");
    const lastName = get("lastName", "last_name", "last", "lastname");
    if (!firstName || !lastName) continue;
    const prefRaw = get("commPreference", "comm", "comm_preference") || "email";
    const pref = prefRaw.toLowerCase();
    const validPref = (["email", "sms", "both", "none"] as const).includes(pref as never)
      ? (pref as RosterRow["commPreference"])
      : "email";
    const isYouthRaw = get("isYouth", "is_youth", "youth");
    out.push({
      orgId,
      firstName,
      lastName,
      email: (get("email") || "").toLowerCase() || null,
      phone: get("phone") || null,
      patrol: get("patrol", "den", "level") || null,
      position: get("position", "role", "title") || null,
      isYouth: isYouthRaw ? truthy(isYouthRaw) : true,
      commPreference: validPref,
      smsOptIn: truthy(get("smsOptIn", "sms_opt_in")),
      skills: splitMulti(get("skills")),
      interests: splitMulti(get("interests")),
      notes: get("notes") || null,
    });
  }
  return out;
}

const UPDATABLE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "patrol",
  "position",
  "isYouth",
  "commPreference",
  "smsOptIn",
  "skills",
  "interests",
  "notes",
] as const;

function arraysEqual(a: unknown, b: unknown): boolean {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  return true;
}

function nameKey(
  firstName: string,
  lastName: string,
  patrol: string | null | undefined,
): string {
  return [firstName, lastName, patrol || ""]
    .map((s) => String(s || "").trim().toLowerCase())
    .join("|");
}

export type ExistingMember = RosterRow & {
  id: string;
  deletedAt?: Date | string | null;
};

export type ImportPlan = {
  creates: RosterRow[];
  updates: Array<{
    id: string;
    data: Record<string, unknown>;
    changes: Record<string, unknown>;
    restored: boolean;
    firstName: string;
    lastName: string;
  }>;
  unchanged: Array<{ id: string; firstName: string; lastName: string }>;
  conflicts: Array<{ row: RosterRow; reason: string }>;
};

export function planRosterImport(args: {
  rows: RosterRow[];
  existing: ExistingMember[];
}): ImportPlan {
  const byEmail = new Map<string, ExistingMember | "__conflict__">();
  const byNameKey = new Map<string, ExistingMember | "__conflict__">();
  for (const m of args.existing || []) {
    if (m.email) {
      const k = m.email.toLowerCase();
      if (byEmail.has(k)) byEmail.set(k, "__conflict__");
      else byEmail.set(k, m);
    }
    const nk = nameKey(m.firstName, m.lastName, m.patrol);
    if (byNameKey.has(nk)) byNameKey.set(nk, "__conflict__");
    else byNameKey.set(nk, m);
  }

  const creates: RosterRow[] = [];
  const updates: ImportPlan["updates"] = [];
  const unchanged: ImportPlan["unchanged"] = [];
  const conflicts: ImportPlan["conflicts"] = [];

  for (const row of args.rows || []) {
    let match: ExistingMember | null = null;
    if (row.email) {
      const hit = byEmail.get(row.email.toLowerCase());
      if (hit === "__conflict__") {
        conflicts.push({ row, reason: `multiple existing members share email ${row.email}` });
        continue;
      }
      if (hit) match = hit;
    }
    if (!match && !row.email) {
      const hit = byNameKey.get(nameKey(row.firstName, row.lastName, row.patrol));
      if (hit === "__conflict__") {
        conflicts.push({
          row,
          reason: `multiple existing members named ${row.firstName} ${row.lastName} in ${row.patrol || "no patrol"}`,
        });
        continue;
      }
      if (hit) match = hit;
    }

    if (!match) {
      creates.push(row);
      continue;
    }

    const changes: Record<string, unknown> = {};
    for (const f of UPDATABLE_FIELDS) {
      const incoming = (row as unknown as Record<string, unknown>)[f];
      const current = (match as unknown as Record<string, unknown>)[f];
      if (Array.isArray(incoming) || Array.isArray(current)) {
        if (!arraysEqual(incoming, current)) changes[f] = incoming;
      } else if ((incoming ?? null) !== (current ?? null)) {
        changes[f] = incoming;
      }
    }
    const restored = !!match.deletedAt;
    if (Object.keys(changes).length === 0 && !restored) {
      unchanged.push({ id: match.id, firstName: match.firstName, lastName: match.lastName });
      continue;
    }
    const data: Record<string, unknown> = { ...changes };
    if (restored) data.deletedAt = null;
    updates.push({
      id: match.id,
      data,
      changes,
      restored,
      firstName: match.firstName,
      lastName: match.lastName,
    });
  }

  return { creates, updates, unchanged, conflicts };
}
