// Static smoke tests for the new marketing pages — plans.html and
// positioning.html. Both are zero-JS HTML files that consume tokens.css
// for palette + typography and link styles.css for the shared marketing
// utilities (.btn, .topnav, .wordmark, .footer).
//
// Asserts:
//   1. The page links /tokens.css BEFORE its own stylesheet so the
//      balanced palette cascades correctly.
//   2. Headline copy matches the JSX source exactly (the README marks
//      copy as "final or near-final" — drift here is a regression).
//   3. The page declares data-palette="balanced" so the lead palette
//      is selected.
//   4. Required structural pieces (the 3-tier grid on plans, the 5-row
//      cost table on positioning) render.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("plans.html", () => {
  const html = readFileSync(resolve(root, "plans.html"), "utf8");

  it("declares the balanced palette via data-palette and shared tokens", () => {
    expect(html).toMatch(/<html[^>]+data-palette="balanced"/);
    // tokens.css must come BEFORE styles.css so the page-local <style>
    // block can override / extend.
    const tokenIdx = html.indexOf('href="/tokens.css"');
    const stylesIdx = html.indexOf('href="/styles.css"');
    expect(tokenIdx).toBeGreaterThan(0);
    expect(stylesIdx).toBeGreaterThan(tokenIdx);
  });

  it("loads Newsreader + Inter Tight + JetBrains Mono", () => {
    expect(html).toMatch(/fonts\.googleapis\.com[^"']*Newsreader/);
    expect(html).toMatch(/fonts\.googleapis\.com[^"']*Inter\+Tight/);
    expect(html).toMatch(/fonts\.googleapis\.com[^"']*JetBrains\+Mono/);
  });

  it("ships the lead headline and undercut framing", () => {
    expect(html).toContain("$99 a year");
    expect(html).toContain("50% more storage");
    expect(html).toContain("$10 less");
    // The "what's settled / what's open" working sidebar — explicit
    // signal that the team hasn't committed to AI pricing yet.
    expect(html).toContain("What's settled");
    expect(html).toMatch(/AI add-on price/i);
  });

  it("renders three tiers (Troop, Troop+AI, Council)", () => {
    // Each tier is a top-level <article> with the tier-card class.
    const tiers = html.match(/<article class="tier-card[^"]*"/g) || [];
    expect(tiers.length).toBe(3);
    expect(html).toContain("Troop + AI");
    expect(html).toContain("Council");
    // Troop is the lead/popular tier.
    expect(html).toMatch(/<article class="tier-card tier-card--popular"/);
    expect(html).toContain("Most troops pick this");
  });

  it("calls out 15 GB storage explicitly (50% more than legacy 10 GB)", () => {
    expect(html).toContain("15 GB");
    expect(html).toContain("$1.50/GB/yr");
  });

  it("lists three storage scenarios (small / active / mega)", () => {
    expect(html).toContain("Small troop");
    expect(html).toContain("Active troop");
    expect(html).toContain("Mega troop");
  });

  it("includes the AI-tier open-question dark panel", () => {
    expect(html).toMatch(/class="panel panel--dark"/);
    expect(html).toContain("Bigger open question");
    expect(html).toMatch(/Cheap experiment/i);
  });

  it("ships an FAQ strip with at least 6 questions", () => {
    const faqs = html.match(/class="faq-q"/g) || [];
    expect(faqs.length).toBeGreaterThanOrEqual(6);
  });

  it("has exactly one <h1> as the page hero", () => {
    const h1s = html.match(/<h1[\s>][^]*?<\/h1>/g) || [];
    expect(h1s.length).toBe(1);
  });

  it("does not regress to the bold palette (no chartreuse, no forest)", () => {
    expect(html).not.toMatch(/#c8e94a/i);
    expect(html).not.toMatch(/#1d3a32/i);
  });
});

describe("positioning.html", () => {
  const html = readFileSync(resolve(root, "positioning.html"), "utf8");

  it("declares the balanced palette via data-palette and shared tokens", () => {
    expect(html).toMatch(/<html[^>]+data-palette="balanced"/);
    const tokenIdx = html.indexOf('href="/tokens.css"');
    const stylesIdx = html.indexOf('href="/styles.css"');
    expect(tokenIdx).toBeGreaterThan(0);
    expect(stylesIdx).toBeGreaterThan(tokenIdx);
  });

  it("ships the principle headline + 'No commodity markups' framing", () => {
    expect(html).toContain("software");
    expect(html).toMatch(/DNS records/i);
    expect(html).toContain("No commodity markups");
  });

  it("lists all five cost-vs-charge rows with real cost numbers", () => {
    const rows = html.match(/class="pos-table__row"/g) || [];
    expect(rows.length).toBe(5);
    expect(html).toContain("Custom domain hosting");
    expect(html).toContain("Photo storage");
    expect(html).toContain("Email from your own domain");
    expect(html).toContain("Payment processing");
    expect(html).toContain("Bandwidth / hosting");
    // The 1,250x markup line is the punchline of the page.
    expect(html).toContain("1,250×");
  });

  it("shows what the $99 actually pays for (4 cards)", () => {
    expect(html).toContain("Engineering");
    expect(html).toContain("Customer support");
    expect(html).toContain("Security &amp; compliance");
    expect(html).toContain("Roadmap research");
  });

  it("ships the honest caveat panel", () => {
    expect(html).toMatch(/honest caveat/i);
    expect(html).toMatch(/structurally honest/i);
  });

  it("has exactly one <h1> as the page hero", () => {
    const h1s = html.match(/<h1[\s>][^]*?<\/h1>/g) || [];
    expect(h1s.length).toBe(1);
  });

  it("does not regress to the bold palette", () => {
    expect(html).not.toMatch(/#c8e94a/i);
    expect(html).not.toMatch(/#1d3a32/i);
  });
});
