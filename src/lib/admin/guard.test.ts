// Every admin page must check access itself (see ./guard.ts): partial
// RSC requests can skip the admin layout, so a page without its own
// check renders for anyone.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN = path.resolve(__dirname, "../../app/o/[slug]/admin");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return pages(p);
    return name === "page.tsx" ? [p] : [];
  });
}

describe("admin pages check access themselves", () => {
  const all = pages(ADMIN);

  it("finds the admin pages", () => {
    expect(all.length).toBeGreaterThan(50);
  });

  for (const file of all) {
    const rel = path.relative(ADMIN, file);
    const treasury = rel.startsWith(`treasury${path.sep}`);
    const guard = treasury ? "requireTreasuryPage" : "requireAdminPage";
    it(`${rel} calls ${guard}`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(new RegExp(`await ${guard}\\(slug\\)`));
    });
  }
});
