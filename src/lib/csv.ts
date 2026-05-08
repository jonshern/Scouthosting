// Minimal CSV writer. RFC 4180-ish: comma-separated, CRLF line endings,
// fields wrapped in double quotes when they contain commas, quotes, or
// newlines; embedded quotes are doubled. Good enough for Excel /
// Google Sheets imports without pulling in a dependency.

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvEscape).join(",");
}

/** Build a full CSV blob from a header row + body rows. */
export function buildCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [csvRow(header), ...rows.map((r) => csvRow(r))];
  return lines.join("\r\n") + "\r\n";
}

/** Standard headers for a CSV download response. */
export function csvHeaders(filename: string): HeadersInit {
  return {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    "cache-control": "no-store",
  };
}
