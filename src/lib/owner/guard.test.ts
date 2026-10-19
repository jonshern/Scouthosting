// Every owner console page must check access itself (see ./guard.ts),
// as admin pages do (lib/admin/guard.test.ts): partial RSC requests can
// skip the layout, so a page without its own check renders for anyone.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CONSOLE = path.resolve(__dirname, "../../app/super-admin");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return pages(p);
    return name === "page.tsx" ? [p] : [];
  });
}

describe("owner console pages check access themselves", () => {
  const all = pages(CONSOLE);

  it("finds the console pages", () => {
    expect(all.length).toBeGreaterThan(10);
  });

  for (const file of all) {
    it(`${path.relative(CONSOLE, file)} calls requireOwnerPage`, () => {
      expect(readFileSync(file, "utf8")).toMatch(/await requireOwnerPage\(/);
    });
  }
});
