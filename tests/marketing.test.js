// Smoke test for the live Compass marketing page (apex /index.html).
//
// Promoted from the marketing/ prototype in alignment step 2 — the prototype
// folder no longer exists; this test now guards the live page directly.
// Zero deps beyond Vitest; reads the static index.html via node:fs.

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

  it("renders the 'Not another Scoutbook' positioning band", () => {
    // The band sits between the stats strip and the three pillars. Its job
    // is to make the comms+org-not-advancement positioning explicit so a
    // committee chair shopping in five minutes never confuses Compass for
    // an advancement product.
    expect(html).toMatch(/<section[^>]*class="[^"]*positioning/);
    expect(html).toMatch(/id="positioning-title"/);
    expect(html).toContain("handles ranks");
    expect(html).toContain("everything else");
    expect(html).toMatch(/parent\s+group-chat/i);
    expect(html).toMatch(/campout RSVP/i);
    expect(html).toMatch(/Sunday-evening\s+newsletter/i);
    expect(html).toMatch(/Troops who\s+communicate well, succeed\./i);
  });

  it("leads the pillars section with Communication then Organization then Security", () => {
    // Three-pillar ordering: Communication first (chat / newsletter / email
    // + SMS), Organization second (calendar / sign-ups / trip plan), Security
    // last (the data-model two-deep + platform story).
    const commsIdx = html.indexOf("Pillar 01 &middot; Communication");
    const orgIdx = html.indexOf("Pillar 02 &middot; Organization");
    const secIdx = html.indexOf("Pillar 03 &middot; Security");
    expect(commsIdx).toBeGreaterThan(0);
    expect(commsIdx).toBeLessThan(orgIdx);
    expect(orgIdx).toBeLessThan(secIdx);
    // Headline capabilities present.
    expect(html).toContain("CHAT");
    expect(html).toContain("NEWSLETTER");
    expect(html).toContain("EMAIL &middot; SMS");
    expect(html).toContain("CALENDAR");
    expect(html).toContain("SIGN-UPS");
    expect(html).toContain("TRIP PLAN");
    expect(html).toContain("TWO-DEEP");
  });

  it("uses the lead Slate & Sky palette via shared /tokens.css", () => {
    // tokens.css is loaded BEFORE styles.css so the marketing site
    // inherits palette + typography from one source of truth.
    expect(html).toMatch(/<link[^>]+href=["']\/tokens\.css["']/);
    expect(html).toMatch(/<link[^>]+href=["']\/?styles\.css["']/);
    // Balanced (Slate & Sky) is the lead palette.
    const tokensPath = resolve(__dirname, "..", "tokens.css");
    const tokens = readFileSync(tokensPath, "utf8");
    expect(tokens).toContain("#0f172a"); // ink/primary — near-black slate
    expect(tokens).toContain("#1d4ed8"); // accent — sky-blue
    expect(tokens).toContain("#f7f8fa"); // bg — cool light gray
    expect(tokens).toContain("#eef1f5"); // surface-alt — cool gray
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

  it("contains all required sections", () => {
    // 1. Top nav
    expect(html).toMatch(/<header[^>]*class="[^"]*topnav/);
    // 2. Hero
    expect(html).toMatch(/<section[^>]*class="[^"]*hero/);
    // 3. Stats band (dark forest)
    expect(html).toMatch(/<section[^>]*class="[^"]*stats/);
    // 4. Pillars (three-pillar product story)
    expect(html).toMatch(/id="product"/);
    expect(html).toMatch(/class="[^"]*pillar pillar--comms/);
    expect(html).toMatch(/class="[^"]*pillar pillar--orgn/);
    expect(html).toMatch(/class="[^"]*pillar pillar--security/);
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

  it("renders the three pillars with their numerals", () => {
    expect(html).toMatch(/Pillar 01 &middot; Communication/);
    expect(html).toMatch(/Pillar 02 &middot; Organization/);
    expect(html).toMatch(/Pillar 03 &middot; Security/);
    for (const n of ["01", "02", "03"]) {
      expect(html).toMatch(new RegExp(`>${n}<`));
    }
  });

  it("uses the secondary spectrum on stats and capabilities", () => {
    // Stats band: 4 distinct top-border tones via .stat-- modifier.
    const statTones = ["accent", "sky", "butter", "teal"];
    for (const t of statTones) {
      expect(html).toMatch(new RegExp(`stat--${t}\\b`));
    }
    // Capabilities carry a data-tone in {sky, accent, raspberry, ember,
    // plum, butter, teal} — at least four distinct tones across the page.
    const capabilityTones = ["sky", "raspberry", "ember", "plum", "teal"];
    for (const t of capabilityTones) {
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
