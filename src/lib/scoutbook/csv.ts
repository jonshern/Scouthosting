// Internet Advancement / Council Advancement CSV parser. Tolerant
// of header variations across SA's exports — we rely on keyword
// matching rather than fixed columns. Anything we don't recognize
// gets pushed into ScoutbookProfile.extras as the raw CSV row keyed
// by header so future surfaces can use it without another sync.

import { parseCsv } from "@/lib/treasury/bank-import";

export type ParsedScoutbookRow = {
  scoutbookUserId: string;
  firstName?: string;
  lastName?: string;
  rank?: string;
  rankAchievedAt?: Date;
  serviceHours?: number;
  campingNights?: number;
  hikingMiles?: number;
  // raw row, preserved for the extras blob.
  raw: Record<string, string>;
};

const ID_HINTS = ["bsa member id", "scoutbook user", "member id", "bsa id"];
const FIRST_HINTS = ["first", "given"];
const LAST_HINTS = ["last", "family"];
const RANK_HINTS = ["rank"];
const RANK_DATE_HINTS = ["rank date", "date earned", "approved"];
const SERVICE_HINTS = ["service hours", "service", "service total"];
const CAMPING_HINTS = ["camping nights", "nights camping", "camping"];
const HIKING_HINTS = ["hiking miles", "miles hiked", "hiking"];

function findCol(headers: string[], hints: string[]): number {
  return headers.findIndex((h) => {
    const lower = h.toLowerCase().trim();
    return hints.some((hint) => lower.includes(hint));
  });
}

function pickNumber(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return undefined;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function pickDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

export type ParseResult = {
  rows: ParsedScoutbookRow[];
  warnings: string[];
};

export function parseAdvancementCsv(text: string): ParseResult {
  const warnings: string[] = [];
  const rows = parseCsv(text);
  if (rows.length < 2) {
    warnings.push("CSV is empty.");
    return { rows: [], warnings };
  }
  const headers = rows[0]!.map((h) => h.trim());
  const idIdx = findCol(headers, ID_HINTS);
  const firstIdx = findCol(headers, FIRST_HINTS);
  const lastIdx = findCol(headers, LAST_HINTS);
  const rankIdx = findCol(headers, RANK_HINTS);
  const rankDateIdx = findCol(headers, RANK_DATE_HINTS);
  const serviceIdx = findCol(headers, SERVICE_HINTS);
  const campingIdx = findCol(headers, CAMPING_HINTS);
  const hikingIdx = findCol(headers, HIKING_HINTS);

  if (idIdx === -1) {
    warnings.push(
      "No BSA Member ID column found. Re-export from Internet Advancement with member IDs visible.",
    );
    return { rows: [], warnings };
  }

  const out: ParsedScoutbookRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const sbId = (r[idIdx] ?? "").trim();
    if (!sbId) continue;
    const raw: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) {
      raw[headers[h]!] = r[h] ?? "";
    }
    out.push({
      scoutbookUserId: sbId,
      firstName: firstIdx === -1 ? undefined : (r[firstIdx] ?? "").trim() || undefined,
      lastName: lastIdx === -1 ? undefined : (r[lastIdx] ?? "").trim() || undefined,
      rank: rankIdx === -1 ? undefined : (r[rankIdx] ?? "").trim() || undefined,
      rankAchievedAt: rankDateIdx === -1 ? undefined : pickDate(r[rankDateIdx]),
      serviceHours: serviceIdx === -1 ? undefined : pickNumber(r[serviceIdx]),
      campingNights: campingIdx === -1 ? undefined : pickNumber(r[campingIdx]),
      hikingMiles: hikingIdx === -1 ? undefined : pickNumber(r[hikingIdx]),
      raw,
    });
  }
  return { rows: out, warnings };
}
