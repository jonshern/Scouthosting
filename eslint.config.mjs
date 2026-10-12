import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    // Findings that predate lint running in CI. Kept visible as warnings
    // until they're cleaned up, so CI can fail on everything else.
    rules: {
      "react/no-unescaped-entities": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      ".next-demo/**",
      "node_modules/**",
      "mobile/**",
      "playwright-report/**",
      "test-results/**",
      "design/**",
      "design-handoff/**",
      "design_handoff_compass_cms/**",
      "next-env.d.ts",
    ],
  },
];

export default config;
