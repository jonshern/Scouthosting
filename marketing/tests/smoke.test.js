// Smoke test for the Compass marketing site prototype.
//
// Mirrors unit-site/tests/smoke.test.js — zero deps beyond Vitest, reads the
// static index.html via node:fs, asserts required strings + structure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const css = readFileSync(resolve(__dirname, "..", "styles.css"), "utf8");

describe("marketing / index.html", () => {
  it("references the Compass brand name", () => {
    expect(html).toContain("Compass");
  });

  it("uses the locked tagline 'Modern software for volunteer units' / 'Volunteer Units'", () => {
    expect(html).toMatch(/Modern Software for Volunteer Units/i);
  });

  it("contains the locked-design hero headline 'look like 2008.'", () => {
    expect(html).toContain("look like 2008.");
  });

  it("includes the required Independent / not-affiliated disclaimer", () => {
    expect(html).toContain(
      "Independent &middot; Not affiliated with Scouting America or BSA."
    );
  });

  it("uses the locked Forest & Ember palette as CSS custom properties", () => {
    expect(html).toMatch(/<link[^>]+href=["']styles\.css["']/);
    expect(css).toContain("#0e3320"); // primary — deep evergreen
    expect(css).toContain("#c8e94a"); // accent — chartreuse
    expect(css).toContain("#f4ecdc"); // bg — warm cream
    expect(css).toContain("#1a1f1a"); // surfaceAlt — dark forest band
  });

  it("loads both Newsreader and Inter Tight from Google Fonts", () => {
    expect(html).toMatch(/fonts\.googleapis\.com[^"']*Newsreader/);
    expect(html).toMatch(/fonts\.googleapis\.com[^"']*Inter\+Tight/);
  });

  it("has a single <h1> as the page title", () => {
    const h1Matches = html.match(/<h1[\s>][^]*?<\/h1>/g) || [];
    expect(h1Matches.length).toBe(1);
    expect(h1Matches[0]).toContain("look like 2008.");
  });

  it("uses <h2> for each major section (no skipped levels)", () => {
    const h2s = html.match(/<h2[\s>][^]*?<\/h2>/g) || [];
    // features, migration, pricing, compare, cta — at least 5
    expect(h2s.length).toBeGreaterThanOrEqual(5);
    // No h4 unless an h3 exists somewhere first.
    const h3Count = (html.match(/<h3[\s>]/g) || []).length;
    const h4Count = (html.match(/<h4[\s>]/g) || []).length;
    if (h4Count > 0) expect(h3Count).toBeGreaterThan(0);
  });

  it("contains all nine required sections", () => {
    // 1. Top nav
    expect(html).toMatch(/<header[^>]*class="[^"]*topnav/);
    // 2. Hero
    expect(html).toMatch(/<section[^>]*class="[^"]*hero/);
    // 3. Stats band (dark forest)
    expect(html).toMatch(/<section[^>]*class="[^"]*stats/);
    // 4. Features (with editorial blocks)
    expect(html).toMatch(/id="product"/);
    expect(html).toMatch(/class="[^"]*feature feature--01/);
    expect(html).toMatch(/class="[^"]*feature feature--04/);
    // 5. Migration band
    expect(html).toMatch(/<section[^>]*class="[^"]*migration/);
    expect(html).toMatch(/id="migration-title"/);
    // 6. Pricing
    expect(html).toMatch(/id="pricing"/);
    expect(html).toMatch(/class="[^"]*tier tier--highlight/);
    // 7. Old-vs-new comparison
    expect(html).toMatch(/<section[^>]*class="[^"]*compare/);
    // 8. CTA
    expect(html).toMatch(/<section[^>]*class="[^"]*cta/);
    // 9. Footer
    expect(html).toMatch(/<footer[^>]*class="[^"]*footer/);
  });

  it("renders the four editorial feature blocks (Calendar / Website / Messages / Memories)", () => {
    expect(html).toContain("CALENDAR");
    expect(html).toContain("WEBSITE");
    expect(html).toContain("MESSAGES");
    expect(html).toContain("MEMORIES");
    // Numerals 01–04
    for (const n of ["01", "02", "03", "04"]) {
      expect(html).toContain(`>${n}<`);
    }
  });

  it("uses the secondary spectrum on stats and features", () => {
    // Stats band: 4 distinct top-border tones via .stat-- modifier.
    const statTones = ["accent", "sky", "butter", "teal"];
    for (const t of statTones) {
      expect(html).toMatch(new RegExp(`stat--${t}\\b`));
    }
    // Features: each feature carries a data-tone in {sky, accent, raspberry, plum}.
    const featureTones = ["sky", "accent", "raspberry", "plum"];
    for (const t of featureTones) {
      expect(html).toMatch(new RegExp(`data-tone="${t}"`));
    }
  });

  it("lists the migration sources called out in the brief", () => {
    for (const src of [
      "TroopWebHost",
      "ScoutLander",
      "TroopTrack",
      "Google Sites",
      "Scoutbook export",
    ]) {
      expect(html).toContain(src);
    }
  });

  it("shows the two pricing tiers — $12 Unit and a District tier", () => {
    expect(html).toContain("$12");
    expect(html).toMatch(/Talk to us/);
    // Highlighted ribbon copy
    expect(html).toContain("MOST TROOPS");
  });

  it("renders both old-vs-new browser-window mocks with realistic chrome", () => {
    expect(html).toMatch(/class="[^"]*browser browser--old/);
    expect(html).toMatch(/class="[^"]*browser browser--new/);
    // Old site keeps the joke URL
    expect(html).toContain("oldhostingplatform.com");
    // New site uses the Compass subdomain pattern
    expect(html).toContain("troop12.compass.app");
  });

  it("provides a skip-link for keyboard users", () => {
    expect(html).toMatch(/class="skip-link"\s+href="#main"/);
  });

  it("declares a viewport meta tag for mobile responsiveness", () => {
    expect(html).toMatch(/<meta\s+name="viewport"/);
  });

  it("anonymizes the comparison mock to Troop 12 / Anytown", () => {
    // The old-site mock keeps the same anonymized unit identity used in
    // unit-site so the two surfaces stay consistent.
    expect(html).toContain("Troop 12");
    expect(html).toContain("Anytown");
    // Fictional Eagle name in the old-site events table.
    expect(html).toContain("Jamie");
  });

  it("CTA section closes with the locked phrase 'before next week's meeting'", () => {
    expect(html).toContain("before next week's meeting");
  });
});
