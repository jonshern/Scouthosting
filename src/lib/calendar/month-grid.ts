// Month-grid helpers for the admin events page. Mostly date math —
// no DB access. The page builds a 6-week grid with leading days
// from the previous month + trailing days from the next month so
// every cell is filled.

export type GridDay = {
  date: Date;
  inMonth: boolean;
  iso: string; // YYYY-MM-DD for keying
};

export function buildMonthGrid(year: number, month0: number): GridDay[] {
  // month0 is 0-indexed (Jan = 0).
  const firstOfMonth = new Date(year, month0, 1);
  const startWeekday = firstOfMonth.getDay(); // 0 = Sun
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - startWeekday);

  const grid: GridDay[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    grid.push({
      date: d,
      inMonth: d.getMonth() === month0,
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    });
  }
  return grid;
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Color palette mapping per the design_handoff_compass_cms event
// types. Falls back to the editorial accent for anything else.
export const CATEGORY_COLORS: Record<string, { bg: string; ink: string; line: string }> = {
  meeting:     { bg: "#dbeafe", ink: "#1e40af", line: "#bfdbfe" },
  campout:     { bg: "#d1fae5", ink: "#065f46", line: "#a7f3d0" },
  service:     { bg: "#fef3c7", ink: "#854d0e", line: "#facc15" },
  "court-of-honor": { bg: "#fee2e2", ink: "#991b1b", line: "#fecaca" },
  trip:        { bg: "#e6ecff", ink: "#1d3a8a", line: "#bcd0f4" },
  training:    { bg: "#ede9fe", ink: "#5b21b6", line: "#c4b5fd" },
  fundraiser:  { bg: "#fef9c3", ink: "#713f12", line: "#ca8a04" },
};

export function colorForCategory(cat: string | null): {
  bg: string;
  ink: string;
  line: string;
} {
  if (!cat) return { bg: "#e6ecff", ink: "#1d3a8a", line: "#bcd0f4" };
  const key = cat.toLowerCase().trim().replace(/\s+/g, "-");
  return (
    CATEGORY_COLORS[key] ?? {
      bg: "#e6ecff",
      ink: "#1d3a8a",
      line: "#bcd0f4",
    }
  );
}

export function monthLabel(year: number, month0: number): string {
  return new Date(year, month0, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}
