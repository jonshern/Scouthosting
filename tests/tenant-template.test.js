// Smoke tests for the live per-tenant template, rebuilt on the Compass
// design tokens in alignment step 3. Two layers of assertions:
//
//   1. The static template (server/template/site.html) preserves all the
//      {{placeholders}} server/render.js expects, references the right
//      stylesheet, and uses the new design tokens (top bar, hero
//      watermark, dark-band advancement, callouts, contact, footer).
//
//   2. The tenant CSS at demo/styles.css declares the Forest & Ember
//      palette and styles every class the render.js helpers emit.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const tpl = readFileSync(resolve(root, "server/template/site.html"), "utf8");
const tenantCss = readFileSync(resolve(root, "demo/styles.css"), "utf8");
const tenantScript = readFileSync(resolve(root, "demo/script.js"), "utf8");

describe("server/template/site.html", () => {
  it("declares the apex tenant stylesheet + Newsreader/Inter Tight fonts", () => {
    expect(tpl).toMatch(/<link[^>]+href=["']\/styles\.css["']/);
    expect(tpl).toMatch(/fonts\.googleapis\.com[^"']*Newsreader/);
    expect(tpl).toMatch(/fonts\.googleapis\.com[^"']*Inter\+Tight/);
  });

  it("preserves every placeholder render.js writes into ctx", () => {
    // Pulled directly from server/render.js#renderSite.
    const required = [
      "{{UNIT_TYPE}}",
      "{{UNIT_NUMBER}}",
      "{{DISPLAY_NAME}}",
      "{{BRAND_MARK}}",
      "{{HERO_HEADLINE}}",
      "{{HERO_LEDE}}",
      "{{CHARTER_ORG}}",
      "{{CITY}}",
      "{{STATE}}",
      "{{COUNCIL}}",
      "{{DISTRICT}}",
      "{{FOUNDED_LINE}}",
      "{{MEETING_DAY}}",
      "{{MEETING_TIME}}",
      "{{MEETING_LOCATION}}",
      "{{SCOUTMASTER_NAME}}",
      "{{SCOUTMASTER_EMAIL}}",
      "{{COMMITTEE_EMAIL}}",
      "{{PRIMARY_COLOR}}",
      "{{ACCENT_COLOR}}",
      "{{ABOUT_BODY}}",
      "{{JOIN_BODY}}",
      "{{CONTACT_NOTE}}",
      "{{ANNOUNCEMENTS}}",
      "{{FEED}}",
      "{{EVENTS}}",
      "{{GALLERY}}",
      "{{NAV_AUTH}}",
      "{{NAV_CUSTOM}}",
      "{{DEMO_BANNER}}",
    ];
    for (const p of required) expect(tpl).toContain(p);
  });

  it("exposes per-org brand override via the inline :root style block", () => {
    expect(tpl).toMatch(/:root\s*\{\s*--primary:\s*\{\{PRIMARY_COLOR\}\};\s*--accent:\s*\{\{ACCENT_COLOR\}\};/);
  });

  it("uses the new design tokens (topbar, hero watermark, callouts, contact)", () => {
    expect(tpl).toMatch(/<header[^>]*class="[^"]*topbar/);
    expect(tpl).toMatch(/class="hero__watermark"/);
    expect(tpl).toMatch(/class="hero__headline"/);
    expect(tpl).toMatch(/class="about"/);
    expect(tpl).toMatch(/class="sponsor-card"/);
    expect(tpl).toMatch(/class="[^"]*\badvancement\b/);
    expect(tpl).toMatch(/class="rank-trail"/);
    expect(tpl).toMatch(/class="callouts"/);
    expect(tpl).toMatch(/class="callout callout--accent/);
    expect(tpl).toMatch(/class="callout callout--sky/);
    expect(tpl).toMatch(/class="callout callout--ember/);
    expect(tpl).toMatch(/class="contact band-dark"/);
    expect(tpl).toMatch(/<footer[^>]*class="footer"/);
  });

  it("nav links cover the existing tenant routes (events, posts, forms, members)", () => {
    expect(tpl).toMatch(/href="\/events"/);
    expect(tpl).toMatch(/href="\/posts"/);
    expect(tpl).toMatch(/href="\/forms"/);
    expect(tpl).toMatch(/href="\/members"/);
  });

  it("links to Scoutbook from the advancement section (deferred system of record)", () => {
    expect(tpl).toMatch(/href="https:\/\/scoutbook\.scouting\.org\/"/);
  });

  it("footer attributes the platform to Compass", () => {
    expect(tpl).toMatch(/href="https:\/\/compass\.app\/"[^>]*>Compass</);
  });

  it("provides a skip-link for keyboard users", () => {
    expect(tpl).toMatch(/class="skip-link"\s+href="#main"/);
  });

  it("has a single <h1> as the page hero", () => {
    const h1Matches = tpl.match(/<h1[\s>][^]*?<\/h1>/g) || [];
    expect(h1Matches.length).toBe(1);
  });
});

describe("demo/styles.css (tenant CSS)", () => {
  it("declares the locked Forest & Ember palette as CSS custom properties", () => {
    expect(tenantCss).toContain("#0e3320"); // primary
    expect(tenantCss).toContain("#c8e94a"); // accent
    expect(tenantCss).toContain("#f4ecdc"); // bg
    expect(tenantCss).toContain("#1a1f1a"); // surface-alt
  });

  it("declares Newsreader + Inter Tight as the type stack", () => {
    expect(tenantCss).toMatch(/--font-display:[^;]*Newsreader/);
    expect(tenantCss).toMatch(/--font-ui:[^;]*Inter Tight/);
  });

  it("styles every class the render.js helpers still emit", () => {
    const helperClasses = [
      ".announcements",
      ".ann-body",
      ".post-feed",
      ".post-pinned",
      ".post-photos",
      ".events",
      ".grid.gallery",
      ".rank-trail",
      ".section-head",
      ".cta-row",
      ".badge",
      ".muted",
      ".tag",
      ".eagle-list",
      ".mbc-list",
      ".forms-list",
      ".vid-grid",
      ".vid-card",
      ".prose",
    ];
    for (const cls of helperClasses) {
      expect(tenantCss).toContain(cls);
    }
  });

  it("styles the new template's structural classes (topbar/hero/about/callouts/contact)", () => {
    const templateClasses = [
      ".topbar",
      ".topbar__nav",
      ".brand-mark",
      ".hero",
      ".hero__watermark",
      ".hero__headline",
      ".about",
      ".about__title",
      ".sponsor-card",
      ".advancement",
      ".callouts",
      ".callout",
      ".contact",
      ".contact-list",
      ".footer",
      ".footer__inner",
    ];
    for (const cls of templateClasses) {
      expect(tenantCss).toContain(cls);
    }
  });

  it("keeps legacy .btn.primary / .btn.ghost aliases for render.js helpers", () => {
    expect(tenantCss).toMatch(/\.btn\.primary/);
    expect(tenantCss).toMatch(/\.btn\.ghost/);
  });

  it("styles the demo banner", () => {
    expect(tenantCss).toContain(".demo-banner");
  });
});

describe("demo/script.js", () => {
  it("only sets the footer year — legacy nav-toggle code is gone", () => {
    expect(tenantScript).toMatch(/getElementById\(["']yr["']\)/);
    expect(tenantScript).toContain("getFullYear()");
    expect(tenantScript).not.toContain("nav-toggle");
  });
});
