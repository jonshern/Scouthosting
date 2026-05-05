import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: "#1d6b39", dark: "#154d29", light: "#2d8a4a" },
        ember: { DEFAULT: "#caa54a", dark: "#a3823a", light: "#dcbb6a" },
        ink: { DEFAULT: "#1a1f1c", muted: "#535a55" },
        bone: { DEFAULT: "#f7f5ef", dark: "#ece8db" },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        display: ['"Source Serif 4"', "Georgia", "serif"],
      },
      maxWidth: { content: "72rem" },
    },
  },
  plugins: [],
};

export default config;
