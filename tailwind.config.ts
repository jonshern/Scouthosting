import type { Config } from "tailwindcss";

// Palette + typography aligned with the design_handoff_compass_cms
// "editorial admin" handoff — warm off-white + taupe lines + a single
// deep-navy accent. Replaces the prior "Slate & Sky" tokens; old keys
// stay as aliases so existing pages keep compiling.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Editorial palette.
        ink: { DEFAULT: "#14171c", soft: "#2a2f38", muted: "#6b7280" },
        line: { DEFAULT: "#e6e3da", soft: "#efece4", strong: "#d8d2c2" },
        surface: {
          DEFAULT: "#ffffff",
          alt: "#efece4",
          dark: "#14171c",
        },
        // Single deep-navy accent.
        accent: { DEFAULT: "#1d3a8a", soft: "#e6ecff" },
        // Semantic status (per handoff).
        success: { DEFAULT: "#15803d", soft: "#d1fae5" },
        warn:    { DEFAULT: "#92400e", soft: "#fef3c7" },
        danger:  { DEFAULT: "#b91c1c", soft: "#fecaca" },

        // Rank colors (advancement) per handoff.
        rank: {
          scoutBg:      "#f5f3ee", scoutInk:      "#6b6760", scoutLine:      "#e8e3d6",
          tenderfootBg: "#fef3c7", tenderfootInk: "#92400e", tenderfootLine: "#fde68a",
          secondBg:     "#dbeafe", secondInk:     "#1e40af", secondLine:     "#bfdbfe",
          firstBg:      "#d1fae5", firstInk:      "#065f46", firstLine:      "#a7f3d0",
          starBg:       "#fef3c7", starInk:       "#854d0e", starLine:       "#facc15",
          lifeBg:       "#fee2e2", lifeInk:       "#991b1b", lifeLine:       "#fecaca",
          eagleBg:      "#fef9c3", eagleInk:      "#713f12", eagleLine:      "#ca8a04",
        },

        // Patrol colors (per handoff).
        patrolEagle:  "#7a1e1e",
        patrolHawk:   "#1d3a8a",
        patrolWolf:   "#15803d",
        patrolOtter:  "#0e7490",
        patrolBear:   "#92400e",

        // Aliases retained from the previous palette so we don't have
        // to sweep every existing page in this PR.
        slate: {
          ink: "#14171c",
          soft: "#2a2f38",
          muted: "#6b7280",
        },
        sky: { DEFAULT: "#1d3a8a", soft: "#e6ecff" },
        amber: { DEFAULT: "#92400e", soft: "#fef3c7" },
        teal: { DEFAULT: "#0e7490", soft: "#cffafe" },
        plum: { DEFAULT: "#475569", soft: "#cbd5e1" },
        forest: { DEFAULT: "#1d3a8a", dark: "#152a66", light: "#3b6cd8" },
        ember: { DEFAULT: "#92400e", dark: "#7c2d10", light: "#fcd34d" },
        bone: { DEFAULT: "#f6f5f1", dark: "#efece4" },
      },
      backgroundColor: {
        bg: "#f6f5f1",
        bg2: "#efece4",
      },
      fontFamily: {
        // Sans for chrome/buttons/inputs. Serif for display/eyebrows/
        // member names. Mono for IDs / slugs / dates / phone.
        sans: ["var(--font-ui)", '"Inter Tight"', '"Inter"', "system-ui", "sans-serif"],
        display: ["var(--font-display)", '"Source Serif 4"', '"Newsreader"', "Georgia", "serif"],
        mono: ["var(--font-mono)", '"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      maxWidth: { content: "72rem" },
    },
  },
  plugins: [],
};

export default config;
