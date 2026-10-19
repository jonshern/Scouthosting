import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { color as c, cssVariables, radius } from "./src/styles/tokens";

// The palette comes from src/styles/tokens.ts (the suite's Modern Clean
// tokens). New code uses the token names (bg, surface, sunk, ink, ink-2,
// muted, line, divider, control, accent, done, attention, danger). The
// older names further down (slate, sky, amber, forest, bone, ...) point at
// the same tokens so pages written before the restyle read right.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c.bg,
        sunk: c.sunk,
        ink: { DEFAULT: c.ink, 2: c.ink2, soft: c.ink2, muted: c.muted },
        muted: c.muted,
        line: { DEFAULT: c.line, soft: c.divider, strong: c.control },
        divider: c.divider,
        control: c.control,
        surface: { DEFAULT: c.surface, alt: c.sunk, dark: c.ink },
        accent: {
          DEFAULT: c.accent,
          ink: c.accentInk,
          text: c.accentText,
          soft: c.accentSoft,
          "soft-text": c.accentSoftText,
        },
        done: { DEFAULT: c.done, ink: c.doneInk, soft: c.doneSoft, text: c.doneText },
        attention: { DEFAULT: c.attention, soft: c.attentionSoft, text: c.attentionText },
        danger: { DEFAULT: c.danger, soft: c.dangerSoft, line: c.dangerLine },
        mark: c.mark,
        "on-ink": { muted: c.onInkMuted, line: c.onInkLine },

        // Older names for the same tokens.
        success: { DEFAULT: c.done, soft: c.doneSoft, text: c.doneText },
        warn: { DEFAULT: c.attention, soft: c.attentionSoft, text: c.attentionText },
        slate: { ink: c.ink, soft: c.ink2, muted: c.muted },
        sky: { DEFAULT: c.accent, soft: c.accentSoft },
        amber: { DEFAULT: c.attention, soft: c.attentionSoft },
        teal: { DEFAULT: "#0E7490", soft: "#E3F4F7" },
        plum: { DEFAULT: c.ink2, soft: c.sunk },
        forest: { DEFAULT: c.accent, dark: c.accentSoftText, light: c.accent },
        ember: { DEFAULT: c.attention, dark: c.attentionText, light: c.attentionSoft },
        bone: { DEFAULT: c.bg, dark: c.sunk },

        // Rank colors (advancement).
        rank: {
          scoutBg:      "#F5F3EE", scoutInk:      "#6B6760", scoutLine:      "#E8E3D6",
          tenderfootBg: "#FEF3C7", tenderfootInk: "#92400E", tenderfootLine: "#FDE68A",
          secondBg:     "#DBEAFE", secondInk:     "#1E40AF", secondLine:     "#BFDBFE",
          firstBg:      "#D1FAE5", firstInk:      "#065F46", firstLine:      "#A7F3D0",
          starBg:       "#FEF3C7", starInk:       "#854D0E", starLine:       "#FACC15",
          lifeBg:       "#FEE2E2", lifeInk:       "#991B1B", lifeLine:       "#FECACA",
          eagleBg:      "#FEF9C3", eagleInk:      "#713F12", eagleLine:      "#CA8A04",
        },

        // Patrol colors.
        patrolEagle:  "#7A1E1E",
        patrolHawk:   "#1D3A8A",
        patrolWolf:   "#157A3F",
        patrolOtter:  "#0E7490",
        patrolBear:   "#8A3F07",
      },
      backgroundColor: {
        bg: c.bg,
        bg2: c.sunk,
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Geist", "system-ui", "sans-serif"],
        // Headings are Geist too (semibold, tight tracking); the name stays
        // so older pages keep compiling.
        display: ["var(--font-sans)", "Geist", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", '"Geist Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        // Controls 10, cards 16, hero panels 20.
        md: `${radius.sm}px`,
        lg: "12px",
        xl: `${radius.md}px`,
        "2xl": `${radius.lg}px`,
      },
      boxShadow: {
        // Lines, not shadows.
        sm: "none",
        DEFAULT: "none",
        md: "none",
        // Popovers and drawers still need lift.
        pop: "0 12px 32px -12px rgb(12 14 18 / 0.18), 0 2px 6px rgb(12 14 18 / 0.06)",
      },
      maxWidth: { content: "75rem" },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ":root": cssVariables() });
    }),
  ],
};

export default config;
