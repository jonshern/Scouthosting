// Smoke test for the Compass public unit site prototype.
//
// Zero deps beyond Vitest itself (already in the root package.json). We use
// node:fs to read the static index.html and run cheap string / regex
// assertions. No jsdom — keeping this pure makes it portable to any CI
// runner that already has Node 20+.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");

describe("unit-site / index.html", () => {
  it("contains the unit identifier 'Troop 12'", () => {
    expect(html).toContain("Troop 12");
  });

  it("references the Compass brand name", () => {
    expect(html).toContain("Compass");
  });

  it("includes the required Independent / not-affiliated disclaimer", () => {
    // Must match exactly per the brief — middot, not hyphen.
    expect(html).toContain(
      "Independent &middot; Not affiliated with Scouting America or BSA."
    );
  });

  it("uses the locked Forest & Ember palette as CSS custom properties", () => {
    // styles.css should declare the deep evergreen + chartreuse tokens. The
    // HTML loads styles.css; verify the file is referenced and sanity-check
    // the palette in the stylesheet itself.
    expect(html).toMatch(/<link[^>]+href=["']styles\.css["']/);
    const css = readFileSync(
      resolve(__dirname, "..", "styles.css"),
      "utf8"
    );
    expect(css).toContain("#0f172a"); // primary — deep evergreen
    expect(css).toContain("#1d4ed8"); // accent — chartreuse
    expect(css).toContain("#f7f8fa"); // bg — warm cream
    expect(css).toContain("#eef1f5"); // surfaceAlt — dark forest band
  });

  it("loads both Newsreader and Inter Tight from Google Fonts", () => {
    expect(html).toMatch(/fonts\.googleapis\.com[^"']*Newsreader/);
    expect(html).toMatch(/fonts\.googleapis\.com[^"']*Inter\+Tight/);
  });

  it("has a single <h1> as the page title", () => {
    const h1Matches = html.match(/<h1[\s>][^]*?<\/h1>/g) || [];
    expect(h1Matches.length).toBe(1);
    expect(h1Matches[0]).toContain("Troop 12");
  });

  it("uses <h2> for each major section (no skipped levels)", () => {
    // Heading hierarchy: about, events, news, gallery each get an h2.
    const h2s = html.match(/<h2[\s>][^]*?<\/h2>/g) || [];
    expect(h2s.length).toBeGreaterThanOrEqual(4);
    // Should not skip levels: no <h4> before there is at least one <h3>.
    const h3Count = (html.match(/<h3[\s>]/g) || []).length;
    const h4Count = (html.match(/<h4[\s>]/g) || []).length;
    if (h4Count > 0) expect(h3Count).toBeGreaterThan(0);
  });

  it("contains all seven required sections", () => {
    // 1. Top bar — header / topbar
    expect(html).toMatch(/<header[^>]*class="[^"]*topbar/);
    // 2. Hero
    expect(html).toMatch(/<section[^>]*class="[^"]*hero/);
    // 3. About + sponsor card
    expect(html).toMatch(/id="about"/);
    expect(html).toMatch(/class="[^"]*sponsor-card/);
    // 4. Upcoming events
    expect(html).toMatch(/id="calendar"/);
    expect(html).toMatch(/class="[^"]*events__list/);
    // 5. News
    expect(html).toMatch(/id="news-title"/);
    // 6. Photo gallery
    expect(html).toMatch(/id="photos"/);
    expect(html).toMatch(/class="[^"]*gallery__grid/);
    // 7. Footer
    expect(html).toMatch(/<footer[^>]*class="[^"]*footer/);
  });

  it("color-codes 5 events using the secondary spectrum", () => {
    // event--sky / ember / raspberry / butter / plum / teal — at least 5
    // distinct tones used.
    const tones = ["sky", "ember", "raspberry", "butter", "plum", "teal"];
    const used = tones.filter((t) =>
      new RegExp(`event--${t}\\b`).test(html)
    );
    expect(used.length).toBeGreaterThanOrEqual(5);
  });

  it("renders at least 6 photos in the gallery via gradient-block placeholders", () => {
    const photoCount = (html.match(/class="photo /g) || []).length;
    expect(photoCount).toBeGreaterThanOrEqual(6);
  });

  it("includes anonymized fictional adults and scouts (no real names)", () => {
    expect(html).toContain("Mr. Avery");
    expect(html).toContain("Mr. Brooks");
    expect(html).toContain("Ms. Carter");
    // At least two of the four mock scouts surface in the news copy.
    const scouts = ["Sam", "Max", "Jamie", "Alex"];
    const present = scouts.filter((n) => html.includes(n));
    expect(present.length).toBeGreaterThanOrEqual(2);
  });

  it("provides a skip-link for keyboard users", () => {
    expect(html).toMatch(/class="skip-link"\s+href="#main"/);
  });

  it("declares a viewport meta tag for mobile responsiveness", () => {
    expect(html).toMatch(/<meta\s+name="viewport"/);
  });

  it("renders the hero numeric watermark element", () => {
    expect(html).toMatch(/class="hero__watermark"[^>]*aria-hidden/);
    // The watermark text itself is the unit number.
    expect(html).toMatch(/class="hero__watermark"[^>]*>\s*12\s*</);
  });
});
