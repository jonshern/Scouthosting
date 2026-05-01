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
