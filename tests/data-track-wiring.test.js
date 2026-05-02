// Static smoke tests that lock in the data-track instrumentation across
// the marketing + admin pages. The first-party telemetry beacon
// (lib/analyticsTag.js#firstPartyTag) emits an `element-clicked` event
// for any element with [data-track="..."]; this test asserts the
// labels we're betting on for the funnel are present.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

describe("Marketing CTA instrumentation", () => {
  it("index.html instruments the topnav, hero, pricing, and footer CTAs", () => {
    const html = read("index.html");
    expect(html).toContain('data-track="topnav-sign-in"');
    expect(html).toContain('data-track="topnav-start-trial"');
    expect(html).toContain('data-track="hero-start-trial"');
    expect(html).toContain('data-track="hero-see-security"');
    expect(html).toContain('data-track="pricing-tier-unit-trial"');
    expect(html).toContain('data-track="pricing-tier-district-book"');
    expect(html).toContain('data-track="footer-cta-start-trial"');
    expect(html).toContain('data-track="footer-cta-talk-to-person"');
  });

  it("plans.html instruments the topnav and tier CTAs", () => {
    const html = read("plans.html");
    expect(html).toContain('data-track="topnav-sign-in"');
    expect(html).toContain('data-track="topnav-start-trial"');
    expect(html).toContain('data-track="plans-tier-troop-trial"');
    expect(html).toContain('data-track="plans-tier-ai-notify"');
  });

  it("positioning.html instruments the topnav CTAs (page is content-only otherwise)", () => {
    const html = read("positioning.html");
    expect(html).toContain('data-track="topnav-sign-in"');
    expect(html).toContain('data-track="topnav-start-trial"');
  });
});

describe("Admin CTA instrumentation", () => {
  it("admin/index.html instruments the dashboard greeting actions", () => {
    const html = read("admin/index.html");
    expect(html).toContain('data-track="dash-send-reminder"');
    expect(html).toContain('data-track="dash-new-event"');
  });

  it("admin/newsletter.html instruments the drafting-now hero actions", () => {
    const html = read("admin/newsletter.html");
    expect(html).toContain('data-track="newsletter-review-draft"');
    expect(html).toContain('data-track="newsletter-send-as-is"');
    expect(html).toContain('data-track="newsletter-skip-week"');
  });

  it("admin/feedback.html instruments suggest, vote-toggle, and open-thread", () => {
    const html = read("admin/feedback.html");
    expect(html).toContain('data-track="feedback-suggest-feature"');
    // Vote-toggle and open-thread appear once per request row; just
    // assert the labels are wired at least once each.
    expect(html).toContain('data-track="feedback-vote-toggle"');
    expect(html).toContain('data-track="feedback-open-thread"');
    // And both exist on multiple rows so we'll see real volume.
    const voteCount = (html.match(/data-track="feedback-vote-toggle"/g) || []).length;
    const threadCount = (html.match(/data-track="feedback-open-thread"/g) || []).length;
    expect(voteCount).toBeGreaterThanOrEqual(5);
    expect(threadCount).toBeGreaterThanOrEqual(5);
  });

  it("admin/calendar.html instruments New event + Edit + Send reminder", () => {
    const html = read("admin/calendar.html");
    expect(html).toContain('data-track="calendar-new-event"');
    expect(html).toContain('data-track="calendar-edit-event"');
    expect(html).toContain('data-track="calendar-send-reminder"');
  });

  it("admin/page-builder.html instruments AI-assist, Build it, and Publish", () => {
    const html = read("admin/page-builder.html");
    expect(html).toContain('data-track="page-builder-try-ai"');
    expect(html).toContain('data-track="page-builder-ai-build"');
    expect(html).toContain('data-track="page-builder-publish"');
  });
});

describe("Naming convention", () => {
  // Labels are kebab-case and grouped by surface + page, so the
  // /__super/analytics 'Top clicks' table reads as a coherent funnel.
  // This test catches accidental SHOUT_CASE / spaces in a label.
  const filesWithLabels = [
    "index.html",
    "plans.html",
    "positioning.html",
    "admin/index.html",
    "admin/newsletter.html",
    "admin/feedback.html",
    "admin/calendar.html",
    "admin/page-builder.html",
  ];

  for (const f of filesWithLabels) {
    it(`${f} uses kebab-case for every data-track label`, () => {
      const html = read(f);
      const labels = [...html.matchAll(/data-track="([^"]+)"/g)].map((m) => m[1]);
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        expect(label).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      }
    });
  }
});
