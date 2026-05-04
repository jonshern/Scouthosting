// Smoke tests for the canvas-only per-tenant template. Two layers:
//
//   1. server/template/site.html — topbar + hero + announcements +
//      {{CUSTOM_BLOCKS}} + footer. Hardcoded About / Advancement /
//      Resources / Contact sections were removed; everything between
//      hero and footer comes from the GrapesJS canvas now.
//
//   2. demo/styles.css declares the Slate & Sky palette and styles
//      every class the render.js helpers still emit.

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
      "{{PRIMARY_COLOR}}",
      "{{ACCENT_COLOR}}",
      "{{ANNOUNCEMENTS}}",
      "{{CUSTOM_BLOCKS}}",
      "{{HERO_PHOTOS}}",
      "{{NAV_AUTH}}",
      "{{NAV_CUSTOM}}",
      "{{DEMO_BANNER}}",
    ];
    for (const p of required) expect(tpl).toContain(p);
  });

  it("exposes per-org brand override via the inline :root style block", () => {
    expect(tpl).toMatch(/:root\s*\{\s*--primary:\s*\{\{PRIMARY_COLOR\}\};\s*--accent:\s*\{\{ACCENT_COLOR\}\};/);
  });

  it("uses the design tokens for the surviving fixed chrome (topbar, hero, footer)", () => {
    expect(tpl).toMatch(/<header[^>]*class="[^"]*topbar/);
    expect(tpl).toMatch(/class="hero__watermark"/);
    expect(tpl).toMatch(/class="hero__headline"/);
    expect(tpl).toMatch(/<footer[^>]*class="footer"/);
  });

  it("hands everything between hero and footer to the canvas", () => {
    // The hardcoded About / Advancement / Resources / Contact sections
    // were removed in the canvas-only refactor.
    expect(tpl).not.toMatch(/class="about"/);
    expect(tpl).not.toMatch(/class="[^"]*\badvancement\b/);
    expect(tpl).not.toMatch(/class="callouts"/);
    expect(tpl).not.toMatch(/class="contact band-dark"/);
  });

  it("nav links cover the existing tenant routes (events, posts, forms, members)", () => {
    expect(tpl).toMatch(/href="\/events"/);
    expect(tpl).toMatch(/href="\/posts"/);
    expect(tpl).toMatch(/href="\/forms"/);
    expect(tpl).toMatch(/href="\/members"/);
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

describe("tokens.css (shared design tokens)", () => {
  const tokensCss = readFileSync(resolve(root, "tokens.css"), "utf8");

  it("declares the lead Slate & Sky (balanced) palette as CSS custom properties", () => {
    // Default :root block IS the balanced palette; alternates live under
    // [data-palette="safe"] and [data-palette="bold"].
    expect(tokensCss).toContain("#0f172a"); // ink/primary — near-black slate
    expect(tokensCss).toContain("#1d4ed8"); // accent — sky-blue
    expect(tokensCss).toContain("#f7f8fa"); // bg — cool light gray
    expect(tokensCss).toContain("#eef1f5"); // surface-alt — cool gray
  });

  it("declares Newsreader + Inter Tight + JetBrains Mono as the type stack", () => {
    expect(tokensCss).toMatch(/--font-display:[^;]*Newsreader/);
    expect(tokensCss).toMatch(/--font-ui:[^;]*Inter Tight/);
    expect(tokensCss).toMatch(/--font-mono:[^;]*JetBrains Mono/);
  });

  it("ships all three palettes (balanced + safe + bold) for re-skinning", () => {
    expect(tokensCss).toMatch(/\[data-palette="safe"\]/);
    expect(tokensCss).toMatch(/\[data-palette="bold"\]/);
    expect(tokensCss).toMatch(/\[data-palette="balanced"\]/);
  });
});

describe("demo/styles.css (tenant CSS)", () => {

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
