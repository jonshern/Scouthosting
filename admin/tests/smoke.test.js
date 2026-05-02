// Smoke test for the Compass admin dashboard prototype.
//
// Mirrors unit-site/tests/smoke.test.js + marketing/tests/smoke.test.js —
// zero deps beyond Vitest, reads the static index.html via node:fs, asserts
// required strings + structure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const css = readFileSync(resolve(__dirname, "..", "styles.css"), "utf8");

describe("admin / index.html", () => {
  it("references the Compass brand name + the unit identifier", () => {
    expect(html).toContain("Compass");
    expect(html).toContain("Troop 12");
  });

  it("includes the required Independent / not-affiliated disclaimer", () => {
    expect(html).toContain(
      "Independent &middot; Not affiliated with Scouting America or BSA."
    );
  });

  it("uses the locked Forest & Ember palette as CSS custom properties", () => {
    expect(html).toMatch(/<link[^>]+href=["']styles\.css["']/);
    expect(css).toContain("#0f172a"); // primary
    expect(css).toContain("#1d4ed8"); // accent
    expect(css).toContain("#f7f8fa"); // bg
    expect(css).toContain("#eef1f5"); // surfaceAlt — dark forest band
    expect(css).toContain("#0f172a"); // surfaceDark — greeting band
  });

  it("loads both Newsreader and Inter Tight from Google Fonts", () => {
    expect(html).toMatch(/fonts\.googleapis\.com[^"']*Newsreader/);
    expect(html).toMatch(/fonts\.googleapis\.com[^"']*Inter\+Tight/);
  });

  it("has a single <h1> as the greeting", () => {
    const h1Matches = html.match(/<h1[\s>][^]*?<\/h1>/g) || [];
    expect(h1Matches.length).toBe(1);
    // Locked greeting copy from AdminBalanced: "Tuesday, evening."
    expect(h1Matches[0]).toMatch(/Tuesday/);
    expect(h1Matches[0]).toMatch(/, evening\./);
  });

  it("uses <h2> for each major section (no skipped levels)", () => {
    const h2s = html.match(/<h2[\s>][^]*?<\/h2>/g) || [];
    // calendar, activity, roster — at least 3 h2s
    expect(h2s.length).toBeGreaterThanOrEqual(3);
    const h3Count = (html.match(/<h3[\s>]/g) || []).length;
    const h4Count = (html.match(/<h4[\s>]/g) || []).length;
    if (h4Count > 0) expect(h3Count).toBeGreaterThan(0);
  });

  it("contains all five required sections", () => {
    // 1. Top nav
    expect(html).toMatch(/<header[^>]*class="[^"]*topnav/);
    // 2. Greeting block (dark forest)
    expect(html).toMatch(/<section[^>]*class="[^"]*greeting/);
    // 3. Stats row
    expect(html).toMatch(/<section[^>]*class="[^"]*stats/);
    // 4. Body grid (calendar + activity)
    expect(html).toMatch(/id="calendar"/);
    expect(html).toMatch(/class="[^"]*agenda/);
    expect(html).toMatch(/class="[^"]*activity/);
    // 5. Roster strip
    expect(html).toMatch(/id="roster"/);
    expect(html).toMatch(/class="[^"]*roster__table/);
  });

  it("renders the seven section tabs in the top nav", () => {
    for (const tab of [
      "Overview",
      "Calendar",
      "Roster",
      "Messages",
      "Photos",
      "Forms",
      "Money",
    ]) {
      expect(html).toContain(`>${tab}<`);
    }
    // Active tab is 'Overview' and gets aria-current="page".
    expect(html).toMatch(/aria-current="page"[^>]*>\s*Overview/);
  });

  it("renders the locked greeting deadline subhead", () => {
    expect(html).toContain("High-Adventure closes RSVPs Friday");
    expect(html).toContain("14 families haven't replied");
    expect(html).toContain("Court of Honor in 2 weeks");
  });

  it("color-codes the four stat cards using the secondary spectrum", () => {
    const tones = ["sky", "accent", "butter", "raspberry"];
    for (const t of tones) {
      expect(html).toMatch(new RegExp(`stat--${t}\\b`));
    }
  });

  it("shows the four upcoming events with a progress bar each", () => {
    for (const name of [
      "PLC meeting",
      "Boundary Waters Trek",
      "May Court of Honor",
      "Spring Camporee",
    ]) {
      expect(html).toContain(name);
    }
    const progressBars = html.match(/role="progressbar"/g) || [];
    expect(progressBars.length).toBe(4);
  });

  it("shows the six activity feed entries with icons", () => {
    for (const who of [
      "Sara Park",
      "Megan O'Brien",
      "Eric Schmidt",
      "Wen Chen",
      "Linh Tran",
    ]) {
      expect(html).toContain(who);
    }
    // Six activity rows.
    const rows = html.match(/class="activity__row"/g) || [];
    expect(rows.length).toBe(6);
  });

  it("renders the roster strip with at least seven scouts and patrol chips", () => {
    for (const name of [
      "Mason Park",
      "Liam O'Brien",
      "Owen Schmidt",
      "Ethan Tran",
      "Noah Garcia",
      "Henry Chen",
      "Isaac White",
    ]) {
      expect(html).toContain(name);
    }
    // Patrol chips: Eagle / Hawk / Wolf — each appears at least once.
    for (const patrol of ["Eagle", "Hawk", "Wolf"]) {
      expect(html).toMatch(new RegExp(`chip--patrol[^>]*>${patrol}<`));
    }
  });

  it("provides a skip-link for keyboard users", () => {
    expect(html).toMatch(/class="skip-link"\s+href="#main"/);
  });

  it("declares a viewport meta tag for mobile responsiveness", () => {
    expect(html).toMatch(/<meta\s+name="viewport"/);
  });

  it("identifies the signed-in admin in the avatar + footer", () => {
    expect(html).toContain("Jenna M.");
    // Avatar initials JM should appear inside the .avatar element.
    expect(html).toMatch(/class="avatar avatar--accent"[^>]*>JM</);
  });
});
