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
  // Per-MB rows extracted from the same CSV via header / row-type
  // heuristics. `applyAdvancementRows` writes these into
  // ScoutbookMeritBadge so the Eagle tracker / member detail panel
  // can render real progress.
  meritBadges: {
    badgeName: string;
    status: string;
    startedAt?: Date;
    completedAt?: Date;
  }[];
  awards: {
    awardName: string;
    awardedAt?: Date;
  }[];
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
// Long-format columns: one row per achievement.
const ITEM_TYPE_HINTS = ["item type", "achievement type", "type"];
const ITEM_NAME_HINTS = ["item name", "badge name", "merit badge", "award name", "award"];
const STATUS_HINTS = ["status", "state"];
const COMPLETED_HINTS = ["completed", "completion date", "date completed", "earned"];
const STARTED_HINTS = ["started", "start date"];

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
  const itemTypeIdx = findCol(headers, ITEM_TYPE_HINTS);
  const itemNameIdx = findCol(headers, ITEM_NAME_HINTS);
  const statusIdx = findCol(headers, STATUS_HINTS);
  const completedIdx = findCol(headers, COMPLETED_HINTS);
  const startedIdx = findCol(headers, STARTED_HINTS);

  if (idIdx === -1) {
    warnings.push(
      "No BSA Member ID column found. Re-export from Internet Advancement with member IDs visible.",
    );
    return { rows: [], warnings };
  }

  // Long-format detection: rows are per-(member, item). We aggregate
  // by member id so the apply pass can upsert one ScoutbookProfile +
  // many ScoutbookMeritBadge / ScoutbookAward rows.
  const isLongFormat = itemTypeIdx !== -1 && itemNameIdx !== -1;

  const byMember = new Map<string, ParsedScoutbookRow>();

  function ensure(sbId: string, raw: Record<string, string>): ParsedScoutbookRow {
    let cur = byMember.get(sbId);
    if (!cur) {
      cur = {
        scoutbookUserId: sbId,
        meritBadges: [],
        awards: [],
        raw: { ...raw },
      };
      byMember.set(sbId, cur);
    }
    return cur;
  }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const sbId = (r[idIdx] ?? "").trim();
    if (!sbId) continue;
    const raw: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) {
      raw[headers[h]!] = r[h] ?? "";
    }
    const rec = ensure(sbId, raw);
    rec.firstName ||= firstIdx === -1 ? undefined : (r[firstIdx] ?? "").trim() || undefined;
    rec.lastName ||= lastIdx === -1 ? undefined : (r[lastIdx] ?? "").trim() || undefined;

    if (isLongFormat) {
      const itemType = (r[itemTypeIdx] ?? "").trim().toLowerCase();
      const itemName = (r[itemNameIdx] ?? "").trim();
      const status = statusIdx === -1 ? "" : (r[statusIdx] ?? "").trim();
      const completedAt = completedIdx === -1 ? undefined : pickDate(r[completedIdx]);
      const startedAt = startedIdx === -1 ? undefined : pickDate(r[startedIdx]);

      if (!itemName) continue;
      if (itemType.includes("rank")) {
        // Aggregated rank promotion to the profile. The most-recent
        // (highest completedAt) wins; we approximate by overwriting.
        rec.rank = itemName;
        if (completedAt) rec.rankAchievedAt = completedAt;
      } else if (itemType.includes("merit badge") || itemType.includes("mb")) {
        rec.meritBadges.push({
          badgeName: itemName,
          status: classifyStatus(status, completedAt),
          startedAt,
          completedAt,
        });
      } else if (itemType.includes("award") || itemType.includes("knot")) {
        rec.awards.push({ awardName: itemName, awardedAt: completedAt });
      }
    } else {
      // Short / wide format — one row per Scout, summary fields only.
      rec.rank ||=
        rankIdx === -1 ? undefined : (r[rankIdx] ?? "").trim() || undefined;
      rec.rankAchievedAt ||=
        rankDateIdx === -1 ? undefined : pickDate(r[rankDateIdx]);
      rec.serviceHours ??=
        serviceIdx === -1 ? undefined : pickNumber(r[serviceIdx]);
      rec.campingNights ??=
        campingIdx === -1 ? undefined : pickNumber(r[campingIdx]);
      rec.hikingMiles ??=
        hikingIdx === -1 ? undefined : pickNumber(r[hikingIdx]);

      // Best-effort: a "Merit Badges" or "Awards" column with a
      // semicolon-/comma-separated list of names. Status defaults to
      // "completed" since wide-format CSVs typically only list
      // earned badges.
      for (let h = 0; h < headers.length; h++) {
        const head = headers[h]!.toLowerCase();
        const v = (r[h] ?? "").trim();
        if (!v) continue;
        if (head.includes("merit badge") && !head.includes("counselor")) {
          for (const name of splitList(v)) {
            rec.meritBadges.push({ badgeName: name, status: "completed" });
          }
        } else if (
          (head === "awards" || head.endsWith(" awards")) &&
          !head.includes("knot")
        ) {
          for (const name of splitList(v)) {
            rec.awards.push({ awardName: name });
          }
        }
      }
    }
  }

  return { rows: [...byMember.values()], warnings };
}

function classifyStatus(s: string, completedAt: Date | undefined): string {
  const lower = s.toLowerCase();
  if (lower.includes("approved") || lower.includes("complete") || completedAt) {
    return "completed";
  }
  if (lower.includes("progress") || lower.includes("started")) {
    return "in-progress";
  }
  if (lower.includes("counselor") || lower.includes("signed")) {
    return "approved";
  }
  return s || "completed";
}

function splitList(v: string): string[] {
  return v
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 200);
}
