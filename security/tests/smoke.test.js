// Smoke test for the Compass Security & Trust page prototype.
//
// Mirrors the other static-site test suites — zero deps beyond Vitest,
// reads index.html via node:fs, asserts required strings + structure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const css = readFileSync(resolve(__dirname, "..", "styles.css"), "utf8");

describe("security / index.html", () => {
  it("references the Compass brand name + the Trust & Safety pill", () => {
    expect(html).toContain("Compass");
    expect(html).toMatch(/Trust\s*&amp;\s*Safety/);
  });

  it("includes the required Independent / not-affiliated disclaimer", () => {
    expect(html).toContain(
      "Independent &middot; Not affiliated with Scouting America or BSA."
    );
  });

  it("uses the locked Forest & Ember palette as CSS custom properties", () => {
    expect(html).toMatch(/<link[^>]+href=["']styles\.css["']/);
    expect(css).toContain("#0e3320"); // primary
    expect(css).toContain("#c8e94a"); // accent
    expect(css).toContain("#f4ecdc"); // bg
    expect(css).toContain("#1d3a32"); // surfaceDark — header band
  });

  it("loads both Newsreader and Inter Tight from Google Fonts", () => {
    expect(html).toMatch(/fonts\.googleapis\.com[^"']*Newsreader/);
    expect(html).toMatch(/fonts\.googleapis\.com[^"']*Inter\+Tight/);
  });

  it("has a single <h1> as the page title using the locked phrase 'youth safety'", () => {
    const h1Matches = html.match(/<h1[\s>][^]*?<\/h1>/g) || [];
    expect(h1Matches.length).toBe(1);
    expect(h1Matches[0]).toMatch(/Built for/);
    expect(h1Matches[0]).toMatch(/youth/);
    expect(h1Matches[0]).toMatch(/safety/);
  });

  it("renders <h2> for each major section (no skipped levels)", () => {
    const h2s = html.match(/<h2[\s>][^]*?<\/h2>/g) || [];
    // promises, audience, signin, data, ypt, ir, checks — 7 h2s
    expect(h2s.length).toBeGreaterThanOrEqual(7);
    const h3Count = (html.match(/<h3[\s>]/g) || []).length;
    const h4Count = (html.match(/<h4[\s>]/g) || []).length;
    if (h4Count > 0) expect(h3Count).toBeGreaterThan(0);
  });

  it("renders the Always / Never promise lists with 5 items each", () => {
    expect(html).toMatch(/class="[^"]*promise promise--good/);
    expect(html).toMatch(/class="[^"]*promise promise--bad/);

    // Five always-do items
    for (const phrase of [
      "Treat youth information as the most sensitive",
      "Hide phone numbers, addresses, and last names",
      "Require photo permission",
      "Let your committee export everything",
      "Tell you within 72 hours",
    ]) {
      expect(html).toContain(phrase);
    }

    // Five never-do items
    for (const phrase of [
      "Sell, rent, or share",
      "Show ads",
      "Track your scouts across",
      "Hold your data hostage",
      "Add a new feature that touches youth data",
    ]) {
      expect(html).toContain(phrase);
    }
  });

  it("renders the audience table with 4 audience columns and 7 data rows", () => {
    expect(html).toMatch(/class="[^"]*audience__table/);

    for (const col of [
      "A stranger on the public page",
      "A parent in the troop",
      "A registered leader",
      "A committee chair",
    ]) {
      expect(html).toContain(col);
    }

    for (const row of [
      "Scout's first name",
      "Scout's last name",
      "Phone &amp; address",
      "Photo (with parent consent)",
      "Medical notes",
      "Background-check status",
      "Audit log of who saw what",
    ]) {
      expect(html).toContain(row);
    }

    // Five badge variants used at least once each.
    for (const variant of ["yes", "partial", "opt", "self", "no"]) {
      expect(html).toMatch(new RegExp(`badge--${variant}\\b`));
    }
  });

  it("renders the Locked / Logged / Yours plain cards", () => {
    const titles = html.match(/class="plain-card__title">[^<]+/g) || [];
    expect(titles.length).toBe(3);
    expect(html).toMatch(/plain-card__title">\s*Locked\./);
    expect(html).toMatch(/plain-card__title">\s*Logged\./);
    expect(html).toMatch(/plain-card__title">\s*Yours\./);
  });

  it("renders the four Youth-protection cards", () => {
    const cards = html.match(/class="ypt__card"/g) || [];
    expect(cards.length).toBe(4);
    for (const title of [
      "No youth contact info on the public page",
      "Photo opt-in, per scout",
      "Two-deep messaging",
      "Background-check status visible",
    ]) {
      expect(html).toContain(title);
    }
  });

  it("renders the IR timeline with the four locked windows", () => {
    for (const window of [
      "Within 1 hour",
      "Within 24 hours",
      "Within 72 hours",
      "Within 30 days",
    ]) {
      expect(html).toContain(window);
    }
  });

  it("renders the four independent-checks cards", () => {
    const cards = html.match(/class="check"/g) || [];
    expect(cards.length).toBe(4);
    for (const title of [
      "SOC 2 Type II",
      "PCI compliant",
      "Parent-consent first",
      "Privacy laws",
    ]) {
      expect(html).toContain(title);
    }
  });

  it("includes the technical-reader callout with the security email", () => {
    expect(html).toMatch(/class="tech-callout"/);
    expect(html).toContain("security@compass.app");
    expect(html).toContain("OIDC/SAML");
  });

  it("provides a skip-link for keyboard users", () => {
    expect(html).toMatch(/class="skip-link"\s+href="#main"/);
  });

  it("declares a viewport meta tag for mobile responsiveness", () => {
    expect(html).toMatch(/<meta\s+name="viewport"/);
  });

  it("footer surfaces the last-reviewed date and security email", () => {
    expect(html).toContain("Last reviewed by our security team");
    expect(html).toContain("April 2026");
    expect(html).toMatch(/<footer[^>]*class="[^"]*footer/);
  });
});
