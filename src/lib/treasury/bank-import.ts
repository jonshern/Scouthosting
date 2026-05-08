// Generic CSV bank import. Treasurers paste any CSV; the parser
// detects sensible defaults (date / amount / description columns)
// and we let them manually map columns when guessing fails.

export type BankParseRow = {
  postedAt: Date;
  amountCents: number;
  description: string;
};

export type BankParseResult = {
  rows: BankParseRow[];
  warnings: string[];
};

export type ColumnMap = {
  date: number;
  amount: number;
  description: number;
  // For 2-column amount layouts (debit / credit), set both. The
  // amount column is then ignored.
  debit?: number;
  credit?: number;
};

const DATE_HINTS = ["posted", "transaction date", "date", "post date"];
const AMOUNT_HINTS = ["amount", "amt", "value"];
const DEBIT_HINTS = ["debit", "withdrawal", "outflow"];
const CREDIT_HINTS = ["credit", "deposit", "inflow"];
const DESC_HINTS = ["description", "memo", "details", "narrative", "payee"];

export function parseCsv(text: string): string[][] {
  // RFC 4180-ish minimal parser. Handles quotes + escaped quotes.
  const rows: string[][] = [];
  let cur: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          buf += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        buf += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        cur.push(buf);
        buf = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i += 1;
        cur.push(buf);
        rows.push(cur);
        cur = [];
        buf = "";
      } else {
        buf += c;
      }
    }
  }
  if (buf || cur.length > 0) {
    cur.push(buf);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export function guessColumnMap(headerRow: string[]): ColumnMap | null {
  const lower = headerRow.map((c) => c.toLowerCase().trim());
  const find = (hints: string[]) =>
    lower.findIndex((h) => hints.some((hint) => h.includes(hint)));
  const dateIdx = find(DATE_HINTS);
  const amountIdx = find(AMOUNT_HINTS);
  const debitIdx = find(DEBIT_HINTS);
  const creditIdx = find(CREDIT_HINTS);
  const descIdx = find(DESC_HINTS);

  if (dateIdx === -1 || descIdx === -1) return null;
  if (amountIdx !== -1) {
    return { date: dateIdx, amount: amountIdx, description: descIdx };
  }
  if (debitIdx !== -1 && creditIdx !== -1) {
    return {
      date: dateIdx,
      amount: -1,
      description: descIdx,
      debit: debitIdx,
      credit: creditIdx,
    };
  }
  return null;
}

function parseAmount(v: string | undefined): number {
  if (!v) return 0;
  const cleaned = v.replace(/[$,\s]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  const f = parseFloat(cleaned);
  if (!Number.isFinite(f)) return 0;
  return Math.round(f * 100);
}

export function applyColumnMap(rows: string[][], map: ColumnMap, hasHeader: boolean): BankParseResult {
  const warnings: string[] = [];
  const out: BankParseRow[] = [];
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i]!;
    const dateStr = r[map.date]?.trim() ?? "";
    const date = new Date(dateStr);
    if (!Number.isFinite(date.getTime())) {
      warnings.push(`Row ${i + 1}: unparseable date ${JSON.stringify(dateStr)}`);
      continue;
    }
    let cents = 0;
    if (map.debit !== undefined && map.credit !== undefined) {
      const debit = parseAmount(r[map.debit]);
      const credit = parseAmount(r[map.credit]);
      cents = credit - debit;
    } else {
      cents = parseAmount(r[map.amount]);
    }
    const desc = (r[map.description] ?? "").trim().slice(0, 500);
    if (cents === 0 && !desc) continue;
    out.push({ postedAt: date, amountCents: cents, description: desc });
  }
  return { rows: out, warnings };
}
