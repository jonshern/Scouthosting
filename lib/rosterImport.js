// Roster import — parses CSV / XLSX bytes into a normalised matrix of
// row arrays (header row first), then maps each data row into a
// Member-shaped DTO ready for prisma.member.createMany.
//
// Two parsers, one normaliser. Tested with: CSV (RFC 4180-ish, quoted
// fields with embedded commas/quotes), XLSX (SheetJS read), legacy XLS
// (also via SheetJS).

import * as XLSX from "xlsx";

/**
 * Parse roster bytes by file format. Returns an array of row arrays —
 * the first row is the header, subsequent rows are data. Empty rows
 * are dropped.
 */
export function parseRoster({ buffer, filename, text }) {
  const fmt = detectFormat({ filename, text, buffer });
  if (fmt === "csv") {
    const src = text || (buffer && buffer.toString("utf8")) || "";
    return parseCsv(src);
  }
  if (fmt === "xlsx") {
    if (!buffer) throw new Error("XLSX import requires the uploaded file (no paste path).");
    return parseXlsx(buffer);
  }
  throw new Error(`Unsupported roster format: ${fmt}`);
}

function detectFormat({ filename, text, buffer }) {
  const ext = String(filename || "").toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "txt") return "csv";
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") return "xlsx";
  // No filename hint — sniff. XLSX is a ZIP (PK header); anything else
  // we treat as CSV.
  if (buffer && buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) return "xlsx";
  if (text || buffer) return "csv";
  return "unknown";
}

/**
 * RFC-4180-style CSV parser. Handles:
 *   - quoted fields with embedded commas/newlines
 *   - escaped quotes ("")
 *   - CRLF or LF line endings
 *   - trailing blank lines
 */
export function parseCsv(text) {
  const rows = [];
  let cur = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

/**
 * Parse the first sheet of an XLSX/XLS workbook into a row matrix.
 * Cells are coerced to strings; null/undefined cells become "".
 */
export function parseXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false, cellNF: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  });
  return matrix.map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
}

/**
 * Map a parsed row matrix into Member DTOs ready for createMany.
 * Tolerates messy real-world headers — accepts firstName / first_name /
 * "First Name" all as the same column. Drops rows missing first or last
 * name silently (those are typically header continuations or footer
 * comment rows).
 */
export function mapMemberRows({ rows, orgId }) {
  if (!rows.length) return [];
  const header = rows[0].map((h) => normaliseHeader(h));
  const idx = (k) => header.indexOf(normaliseHeader(k));
  const truthy = (v) => /^(1|true|yes|y)$/i.test(String(v || "").trim());

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (...keys) => {
      for (const k of keys) {
        const i = idx(k);
        if (i >= 0) return (row[i] ?? "").trim();
      }
      return "";
    };
    const firstName = get("firstName", "first_name", "first", "firstname");
    const lastName = get("lastName", "last_name", "last", "lastname");
    if (!firstName || !lastName) continue;
    const pref = get("commPreference", "comm", "comm_preference") || "email";
    out.push({
      orgId,
      firstName,
      lastName,
      email: (get("email") || "").toLowerCase() || null,
      phone: get("phone") || null,
      patrol: get("patrol", "den", "level") || null,
      position: get("position", "role", "title") || null,
      isYouth: get("isYouth", "is_youth", "youth") ? truthy(get("isYouth", "is_youth", "youth")) : true,
      commPreference: ["email", "sms", "both", "none"].includes(pref.toLowerCase())
        ? pref.toLowerCase()
        : "email",
      smsOptIn: truthy(get("smsOptIn", "sms_opt_in")),
      skills: splitMulti(get("skills")),
      interests: splitMulti(get("interests")),
      notes: get("notes") || null,
    });
  }
  return out;
}

function normaliseHeader(s) {
  return String(s || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function splitMulti(s) {
  if (!s) return [];
  return String(s)
    .split(/[;|,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// Fields the importer is allowed to overwrite on an existing Member.
// Deliberately excludes parentIds, status, scoutbookUserId, dietaryFlags,
// emailUnsubscribed, bouncedAt — those are managed elsewhere (lead
// workflow, family-link UI, deliverability webhooks) and shouldn't be
// clobbered by a column the leader didn't realise was there.
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
];

function arraysEqual(a, b) {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  return true;
}

function nameKey(firstName, lastName, patrol) {
  return [firstName, lastName, patrol || ""]
    .map((s) => String(s || "").trim().toLowerCase())
    .join("|");
}

/**
 * Plan a roster import: match incoming rows against existing Members and
 * categorise each as a create, an update (with the field diff), an
 * unchanged hit, or a conflict (row matches multiple existing rows
 * ambiguously).
 *
 * Match strategy, in order:
 *   1. Email (case-insensitive) within the org. Authoritative if present
 *      on both sides — even if the name doesn't match, treat as update.
 *   2. firstName + lastName + patrol (case-insensitive) for rows with no
 *      email. Cubs/scouts often share a parent's email; this fallback
 *      lets the importer round-trip an exported roster of email-less
 *      youth.
 *
 * Soft-deleted matches (existing.deletedAt != null) get restored on
 * update — re-uploading a roster after a "Remove" undoes the soft-delete.
 *
 * Pure function. Pass `existing` as the full org member list (including
 * soft-deleted rows). Returns the plan; the caller commits via Prisma.
 *
 * @param {{ rows: object[], existing: object[] }} input
 *   rows: output of mapMemberRows() — DTOs with the import-shaped fields
 *   existing: org's Member rows (any deletedAt)
 * @returns {{
 *   creates:   object[],
 *   updates:   { id: string, data: object, changes: object, restored: boolean }[],
 *   unchanged: { id: string, firstName: string, lastName: string }[],
 *   conflicts: { row: object, reason: string }[],
 * }}
 */
export function planRosterImport({ rows, existing }) {
  const byEmail = new Map();
  const byNameKey = new Map();
  for (const m of existing || []) {
    if (m.email) {
      const k = m.email.toLowerCase();
      // Two existing members with the same email is itself a conflict —
      // remember it so we can surface it rather than silently picking one.
      if (byEmail.has(k)) byEmail.set(k, "__conflict__");
      else byEmail.set(k, m);
    }
    const nk = nameKey(m.firstName, m.lastName, m.patrol);
    if (byNameKey.has(nk)) byNameKey.set(nk, "__conflict__");
    else byNameKey.set(nk, m);
  }

  const creates = [];
  const updates = [];
  const unchanged = [];
  const conflicts = [];

  for (const row of rows || []) {
    let match = null;
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

    // Compute the diff: only include fields whose normalised value
    // actually changes. Skips orgId — never updatable.
    const changes = {};
    for (const f of UPDATABLE_FIELDS) {
      const incoming = row[f];
      const current = match[f];
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
    const data = { ...changes };
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
