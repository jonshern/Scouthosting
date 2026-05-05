// Compass design tokens — three palettes (safe / balanced / bold)
// Pine, ember, evergreen. All distinct from Scouting America's khaki/gold
// and Northern Star's blue.

window.SH_PALETTES = {
  safe: {
    name: 'Pine & Brass',
    // Refined heritage. Pine green + cream paper + brass gold.
    bg: '#f5f1e8',          // warm cream paper
    surface: '#ffffff',
    surfaceAlt: '#ede6d4',  // tan
    ink: '#1c2a1f',         // near-black green
    inkSoft: '#3d4a3f',
    inkMuted: '#6b7166',
    line: '#d9d0bc',
    lineSoft: '#e6dfcc',
    primary: '#1f4d2c',     // pine
    primaryHover: '#163a20',
    accent: '#b8862b',       // brass
    accentSoft: '#e7c878',
    danger: '#9a3a2a',
    success: '#3d6b3a',
    chip: '#e8e0c8',
  },
  balanced: {
    name: 'Slate & Sky',
    // Clean and cool with bold accents. Near-black slate primary,
    // cool light-gray surfaces, sky-blue as the single bold pop.
    // No green, no warmth — disciplined and modern.
    bg: '#f7f8fa',           // very light cool gray
    surface: '#ffffff',
    surfaceAlt: '#eef1f5',   // cool gray surface
    surfaceDark: '#0f172a',  // near-black slate for inverted blocks
    ink: '#0f172a',
    inkSoft: '#334155',
    inkMuted: '#64748b',
    line: '#e2e8f0',
    lineSoft: '#eef1f5',
    primary: '#0f172a',      // near-black slate
    primaryHover: '#020617',
    accent: '#1d4ed8',       // sky/royal blue — the bold pop
    accentSoft: '#bcd0f4',
    danger: '#dc2626',
    success: '#059669',
    chip: '#e2e8f0',
    // — Secondary spectrum (cool only) —
    sky:        '#1d4ed8',
    skySoft:    '#bcd0f4',
    ember:      '#f59e0b',   // amber — the one warm contrast
    emberSoft:  '#fde68a',
    raspberry:  '#0f172a',   // dial back to neutral
    raspberrySoft: '#cbd5e1',
    butter:     '#f59e0b',   // amber alias
    butterSoft: '#fde68a',
    plum:       '#475569',   // dial back to neutral
    plumSoft:   '#cbd5e1',
    teal:       '#0891b2',   // keep teal as cool variety
    tealSoft:   '#bee5ef',
  },
  bold: {
    name: 'Evergreen & Spectrum',
    // Modern. Deep evergreen anchor + chartreuse highlight + a full secondary
    // spectrum (sky, ember, raspberry, butter, plum) used for categories,
    // event types, stat cards, chips, and illustrations.
    bg: '#f4ecdc',          // warmer cream — more saturation
    surface: '#ffffff',
    surfaceAlt: '#1a1f1a',  // dark surface for inverted sections
    ink: '#0d130d',
    inkSoft: '#2a352a',
    inkMuted: '#5a6258',
    line: '#d4c8a8',
    lineSoft: '#e6dcc0',
    primary: '#0e3320',     // very deep green
    primaryHover: '#06200f',
    accent: '#c8e94a',      // chartreuse
    accentSoft: '#e3f29b',
    danger: '#a82e1d',
    success: '#3d6b3a',
    chip: '#0e3320',

    // — Secondary spectrum (use across UI for categories/variety) —
    sky:        '#3a7ab8',  // calendar / informational
    skySoft:    '#bcd6ec',
    ember:      '#e07a3c',  // events / outdoor
    emberSoft:  '#f5cba8',
    raspberry:  '#c43d6b',  // urgent / alerts (warmer than danger)
    raspberrySoft: '#f0bccc',
    butter:     '#f3c54a',  // money / finance / sun
    butterSoft: '#faecb8',
    plum:       '#6e3b7a',  // photos / personal / private
    plumSoft:   '#d6bcdc',
    teal:       '#3aa893',  // success-y / scoutbook sync
    tealSoft:   '#bce0d8',
  },
};

// Type & spacing — shared
window.SH_TYPE = {
  display: '"Newsreader", "Source Serif Pro", Georgia, serif',
  ui: '"Inter Tight", "Inter", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
};
