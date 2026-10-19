// Compass's look, in one place: the suite's "Modern Clean" tokens, shared
// with Waypoint and Lantern. Names and values match Lantern's
// app/src/lib/theme.ts so the three apps can later read them from one
// scout-core package. tailwind.config.ts builds the Tailwind palette from
// this file and writes every value as a CSS variable (--bg, --ink-2,
// --accent-soft-text, ...), so components use classes or var(--...),
// never a hex of their own.
//
// The look: a near-white ground, white cards with a thin line instead of
// shadows, ink for the mark and hero panels, one blue accent for the thing
// to press. Geist for words, Geist Mono for IDs, dates and small labels.

export const color = {
  /** The page. */
  bg: "#FAFAF9",
  /** Cards. */
  surface: "#FFFFFF",
  /** A quiet fill: quiet buttons, table heads, icon wells, nav hover. */
  sunk: "#F2F2EF",
  ink: "#0C0E12",
  ink2: "#3A3F47",
  muted: "#5F6670",
  /** Card edges. */
  line: "#E6E6E3",
  /** Between rows inside a card. */
  divider: "#EFEFEC",
  /** The edge of inputs and secondary buttons. */
  control: "#D6D6D1",
  /** The one accent: the thing to press, the tab you are on. */
  accent: "#1D4ED8",
  accentInk: "#FFFFFF",
  /** Accent as text on the page or a card. */
  accentText: "#1D4ED8",
  accentSoft: "#EEF3FF",
  /** Accent text on accentSoft. */
  accentSoftText: "#1D3A8A",
  done: "#157A3F",
  doneInk: "#FFFFFF",
  doneSoft: "#E8F4EC",
  doneText: "#11613A",
  attention: "#B4530A",
  attentionSoft: "#FCF0E3",
  attentionText: "#8A3F07",
  danger: "#A61B1B",
  dangerSoft: "#FDEDED",
  dangerLine: "#F1C9C9",
  /** The product mark's tile. Ink in both modes. */
  mark: "#0C0E12",
  /** Secondary words on an ink panel. */
  onInkMuted: "#C4C8CF",
  /** Lines on an ink panel. */
  onInkLine: "#2A2F38",
  /** Photo placeholders: sky, far hills, near hills. */
  photoSky: "#E9EDF3",
  photoHill: "#D5DCE6",
  photoHillNear: "#C2CBD8",
  photoSun: "#F4F6F9",
  /** A filled row on an ink panel (the current item in a dark sidebar). */
  onInkRaised: "#1F242C",
} as const;

/** 10 for controls, 16 for cards, 20 for hero panels. */
export const radius = { sm: 10, md: 16, lg: 20, pill: 999 } as const;

/** 4-pt spacing. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

export const font = {
  sans: '"Geist", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"Geist Mono", ui-monospace, "SFMono-Regular", monospace',
} as const;

/** `accentSoftText` → `--accent-soft-text`, `ink2` → `--ink-2`. */
export function cssVarName(key: string): string {
  return `--${key.replace(/([A-Z0-9])/g, (m) => `-${m.toLowerCase()}`)}`;
}

/** Every token as a CSS custom property, for :root. */
export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(color)) vars[cssVarName(k)] = v;
  for (const [k, v] of Object.entries(radius)) vars[`--radius-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(space)) vars[`--space-${k}`] = `${v}px`;
  return vars;
}
