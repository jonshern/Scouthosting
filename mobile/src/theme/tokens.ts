// Compass design tokens — Forest & Ember (the `bold` palette in
// design/source/tokens.js). Mirror values exactly; the smoke test asserts
// 1:1 parity against the canonical palette.
//
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
  name: 'Evergreen & Spectrum',
  bg: '#f4ecdc',
  surface: '#ffffff',
  surfaceAlt: '#1a1f1a',
  ink: '#0d130d',
  inkSoft: '#2a352a',
  inkMuted: '#5a6258',
  line: '#d4c8a8',
  lineSoft: '#e6dcc0',
  primary: '#0e3320',
  primaryHover: '#06200f',
  accent: '#c8e94a',
  accentSoft: '#e3f29b',
  danger: '#a82e1d',
  success: '#3d6b3a',
  chip: '#0e3320',
  sky: '#3a7ab8',
  skySoft: '#bcd6ec',
  ember: '#e07a3c',
  emberSoft: '#f5cba8',
  raspberry: '#c43d6b',
  raspberrySoft: '#f0bccc',
  butter: '#f3c54a',
  butterSoft: '#faecb8',
  plum: '#6e3b7a',
  plumSoft: '#d6bcdc',
  teal: '#3aa893',
  tealSoft: '#bce0d8',
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
