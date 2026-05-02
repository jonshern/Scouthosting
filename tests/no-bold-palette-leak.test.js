// Regression test: the OLD bold (Forest & Ember) palette must not leak
// back into any live production code. We learned this the hard way —
// the marketing/admin static mocks got repaletted to balanced in the
// design_handoff_compass merge, but the server-rendered admin shell
// (server/admin.js#ADMIN_SHELL_CSS), the /choose-org / /me / /help
// fragments in server/index.js, the super-admin theme, the email
// renderers, and the seed data all inlined the old hexes and shipped
// the wrong colors after a redeploy.
//
// This test reads every file in the live-code allowlist and fails if
// any of the bold-only hex values appear. It DOES allow the bold
// palette inside tokens.css under [data-palette="bold"] (intentional
// alternate palette), and inside the test files that explicitly
// assert the bold palette is absent.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Hex values that ONLY appear in the bold palette. Balanced overlap
// values (#ffffff, #f59e0b which IS amber/butter in balanced too) are
// not on this list.
const BOLD_ONLY_HEXES = [
  "#c8e94a", // accent — chartreuse
  "#0e3320", // primary — deep evergreen
  "#06200f", // primary-hover — deeper pine
  "#0d130d", // ink — near-black green
  "#2a352a", // ink-soft
  "#5a6258", // ink-muted — gray-green
  "#d4c8a8", // line — tan
  "#e6dcc0", // line-soft
  "#f4ecdc", // bg — warm cream
  "#1a1f1a", // surface-alt — very dark green
  "#1d3a32", // surface-dark — deep evergreen
  "#ede0bf", // surface-sand
  "#e3f29b", // accent-soft
  "#a82e1d", // danger
  "#3d6b3a", // success — forest
  "#3a7ab8", // sky
  "#bcd6ec", // sky-soft
  "#e07a3c", // ember orange
  "#c43d6b", // raspberry
  "#f0bccc", // raspberry-soft
  "#f3c54a", // butter (bold yellow)
  "#6e3b7a", // plum
  "#3aa893", // teal
  "#bce0d8", // teal-soft
];

// Files / directories that legitimately contain the bold palette.
const ALLOW_FILES = new Set([
  // tokens.css ships all 3 palettes; bold lives under [data-palette="bold"].
  "tokens.css",
  // styles.css mirrors the same multi-palette structure.
  "styles.css",
  // Anti-regression assertions in these tests literally contain the
  // strings as `not.toMatch(/#c8e94a/)` so they protect, not pollute.
  "tests/marketing-extra-pages.test.js",
  "tests/email-digest.test.js",
  "tests/admin-pages.test.js",
  "tests/no-bold-palette-leak.test.js", // this file
]);

const ALLOW_DIRS = [
  // Original design handoff source — historical record, not shipped.
  "design_handoff_compass",
  "design/source",
  // Old static-design references (paralleled the design files).
  // Updated to balanced in the same sweep that fixed the leak; the
  // allow-list keeps the rule readable if someone restores them.
  // (Removed from allow-list: their content is now balanced too.)
  // Generated artifacts and migrations.
  "node_modules",
  "prisma/migrations",
  ".git",
];

const SCAN_EXTS = new Set([".js", ".ts", ".tsx", ".jsx", ".html", ".css", ".json", ".md", ".prisma"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = relative(root, abs);
    if (ALLOW_DIRS.some((d) => rel === d || rel.startsWith(d + "/"))) continue;
    let stat;
    try { stat = statSync(abs); } catch { continue; }
    if (stat.isDirectory()) yield* walk(abs);
    else if (SCAN_EXTS.has("." + entry.split(".").pop())) yield abs;
  }
}

describe("No bold-palette leak in live code", () => {
  for (const hex of BOLD_ONLY_HEXES) {
    it(`${hex} appears nowhere outside the allowlist`, () => {
      const offenders = [];
      for (const file of walk(root)) {
        const rel = relative(root, file);
        if (ALLOW_FILES.has(rel)) continue;
        let body;
        try { body = readFileSync(file, "utf8"); } catch { continue; }
        if (body.toLowerCase().includes(hex.toLowerCase())) {
          // Find the line for a useful failure message.
          const lines = body.split("\n");
          const idx = lines.findIndex((l) => l.toLowerCase().includes(hex.toLowerCase()));
          offenders.push(`${rel}:${idx + 1}`);
        }
      }
      expect(
        offenders,
        offenders.length
          ? `bold-palette hex ${hex} leaked back into:\n  ${offenders.join("\n  ")}`
          : "",
      ).toEqual([]);
    });
  }

  it("tokens.css still ships the bold palette under [data-palette=\"bold\"] (architecture supports re-skinning)", () => {
    const css = readFileSync(resolve(root, "tokens.css"), "utf8");
    expect(css).toMatch(/\[data-palette="bold"\]/);
    expect(css).toContain("#c8e94a");
    expect(css).toContain("#0e3320");
  });
});
