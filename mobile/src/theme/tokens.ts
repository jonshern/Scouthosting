// Compass design tokens — Slate & Sky (the `balanced` palette in
// design_handoff_compass/designs/tokens.js). Mirror values exactly; the
// smoke test asserts 1:1 parity against the canonical palette.
//
// The product ships three palettes (safe / balanced / bold). Mobile leads
// with `balanced` — slate ink, near-black surfaces, sky-blue as the bold
// pop, amber as the one warm contrast, teal kept for cool variety.
// Do not introduce new colors here without updating the design system
// reference first.

export type Palette = {
  name: string;
  bg: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  inkSoft: string;
  inkMuted: string;
  line: string;
  lineSoft: string;
  primary: string;
  primaryHover: string;
  accent: string;
  accentSoft: string;
  danger: string;
  success: string;
  chip: string;
  // Secondary spectrum
  sky: string;
  skySoft: string;
  ember: string;
  emberSoft: string;
  raspberry: string;
  raspberrySoft: string;
  butter: string;
  butterSoft: string;
  plum: string;
  plumSoft: string;
  teal: string;
  tealSoft: string;
};

export const palette: Palette = {
  name: 'Slate & Sky',
  bg: '#f7f8fa',
  surface: '#ffffff',
  surfaceAlt: '#eef1f5',
  ink: '#0f172a',
  inkSoft: '#334155',
  inkMuted: '#64748b',
  line: '#e2e8f0',
  lineSoft: '#eef1f5',
  primary: '#0f172a',
  primaryHover: '#020617',
  accent: '#1d4ed8',
  accentSoft: '#bcd0f4',
  danger: '#dc2626',
  success: '#059669',
  chip: '#e2e8f0',
  // Secondary spectrum — kept distinct so mobile category cards still read
  // as different things (calendar = sky, outing = ember/amber, photos =
  // plum/teal etc.). Balanced collapses raspberry/plum to neutrals.
  sky: '#1d4ed8',
  skySoft: '#bcd0f4',
  ember: '#f59e0b',
  emberSoft: '#fde68a',
  raspberry: '#0f172a',
  raspberrySoft: '#cbd5e1',
  butter: '#f59e0b',
  butterSoft: '#fde68a',
  plum: '#475569',
  plumSoft: '#cbd5e1',
  teal: '#0891b2',
  tealSoft: '#bee5ef',
};

// Type system — Newsreader for display, Inter Tight for UI. System
// fallbacks are fine on mobile until expo-font finishes loading.
export const fonts = {
  display: 'Newsreader',
  displayItalic: 'Newsreader-Italic',
  ui: 'InterTight',
  uiMedium: 'InterTight-Medium',
  uiSemibold: 'InterTight-SemiBold',
  uiBold: 'InterTight-Bold',
} as const;

export const fontFamilies = {
  // Used as React Native fontFamily. Until expo-font registers Newsreader
  // / InterTight, the system serif/sans is acceptable.
  display: 'Newsreader',
  ui: 'InterTight',
} as const;

export const typography = {
  // Mobile-tuned scale (web hero scale is unreasonable on phone)
  hero: { fontSize: 32, lineHeight: 36, letterSpacing: -0.6 },
  h1: { fontSize: 30, lineHeight: 34, letterSpacing: -0.5 },
  h2: { fontSize: 26, lineHeight: 30, letterSpacing: -0.4 },
  h3: { fontSize: 22, lineHeight: 26, letterSpacing: -0.3 },
  cardTitle: { fontSize: 18, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontSize: 14, lineHeight: 21 },
  bodyLarge: { fontSize: 17, lineHeight: 26 },
  meta: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  micro: { fontSize: 11, lineHeight: 14, letterSpacing: 0.6 },
  eyebrow: { fontSize: 11, lineHeight: 14, letterSpacing: 1.6 },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
  // Mobile screen edge padding per design README
  screen: 20,
} as const;

export const radius = {
  chip: 4,
  button: 6,
  cardSm: 8,
  input: 10,
  card: 12,
  cardLg: 14,
  sheet: 16,
  pill: 999,
} as const;

export const shadow = {
  // Subtle floating shadow per design README
  float: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
} as const;

export type Theme = {
  palette: Palette;
  typography: typeof typography;
  spacing: typeof spacing;
  radius: typeof radius;
  shadow: typeof shadow;
  fonts: typeof fonts;
};

export const theme: Theme = {
  palette,
  typography,
  spacing,
  radius,
  shadow,
  fonts,
};

export default theme;
