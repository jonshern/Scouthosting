import type { Config } from "tailwindcss";

// Palette + typography from design_handoff_compass/designs/tokens.js —
// "balanced" / Slate & Sky is the lead direction.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Lead palette — slate near-black + cool grays + sky-blue accent.
        slate: {
          ink: "#0f172a",
          soft: "#334155",
          muted: "#64748b",
        },
        line: { DEFAULT: "#e2e8f0", soft: "#eef1f5" },
        surface: {
          DEFAULT: "#ffffff",
          alt: "#eef1f5",
          dark: "#0f172a",
        },
        sky: { DEFAULT: "#1d4ed8", soft: "#bcd0f4" },

        // Spectrum for stat strips / category accents.
        amber: { DEFAULT: "#f59e0b", soft: "#fde68a" },
        teal: { DEFAULT: "#0891b2", soft: "#bee5ef" },
        plum: { DEFAULT: "#475569", soft: "#cbd5e1" },

        // Legacy aliases so existing app/admin pages keep compiling
        // until we sweep them onto the new palette.
        forest: { DEFAULT: "#1d4ed8", dark: "#1e40af", light: "#3b82f6" },
        ember: { DEFAULT: "#f59e0b", dark: "#b45309", light: "#fcd34d" },
        ink: { DEFAULT: "#0f172a", muted: "#64748b" },
        bone: { DEFAULT: "#f7f8fa", dark: "#eef1f5" },
      },
      backgroundColor: {
        bg: "#f7f8fa",
      },
      fontFamily: {
        sans: ["var(--font-ui)", '"Inter Tight"', '"Inter"', "system-ui", "sans-serif"],
        display: ["var(--font-display)", '"Newsreader"', "Georgia", "serif"],
        mono: ["var(--font-mono)", '"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      maxWidth: { content: "72rem" },
    },
  },
  plugins: [],
};

export default config;
