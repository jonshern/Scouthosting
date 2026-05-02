// Static smoke tests for the flagship Weekly Trail Mix email template.
// The template ships with example stories pre-rendered so the leader's
// preview pane in admin/newsletter.html can iframe it directly without
// executing any JS / hitting any DB.
//
// Inbox-rendering requirements we want to lock down:
//   - 640px max width (iPhone Mail safe)
//   - Table-based layout (Outlook 2016 still hates flexbox)
//   - All buttons rendered as <td> with bg-color (no CSS gradients;
//     Outlook strips them)
//   - Preheader hidden in body but exposed for inbox preview
//   - Unsubscribe link present (RFC 8058 list-unsubscribe path)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, "..", "email", "digest.html"), "utf8");

describe("email/digest.html", () => {
  it("constrains layout to 640px max-width", () => {
    expect(html).toMatch(/max-width:\s*640px/);
  });

  it("uses a single outer <table> for layout (Outlook-safe)", () => {
    expect(html).toMatch(/<table[^>]+role="presentation"/);
  });

  it("pulls Newsreader + Inter Tight from Google Fonts", () => {
    expect(html).toMatch(/fonts\.googleapis\.com[^"']*Newsreader/);
    expect(html).toMatch(/fonts\.googleapis\.com[^"']*Inter\+Tight/);
  });

  it("ships the {{ISSUE_NUMBER}}, {{HEADLINE}}, {{INTRO}}, {{STORIES_HTML}} placeholders", () => {
    expect(html).toContain("{{ISSUE_NUMBER}}");
    expect(html).toContain("{{HEADLINE}}");
    expect(html).toContain("{{INTRO}}");
    expect(html).toContain("{{STORIES_HTML}}");
    expect(html).toContain("{{WEEK_LABEL}}");
    expect(html).toContain("{{TROOP_NAME}}");
    expect(html).toContain("{{TROOP_LOCATION}}");
    expect(html).toContain("{{SIGNOFF_QUOTE}}");
    expect(html).toContain("{{SIGNOFF_NAME}}");
    expect(html).toContain("{{UNSUBSCRIBE_URL}}");
  });

  it("hides a preheader for the inbox preview line", () => {
    expect(html).toMatch(/display:\s*none[\s\S]*max-height:\s*0[\s\S]*opacity:\s*0/);
  });

  it("renders all three example story types (campout, achievement, service)", () => {
    expect(html).toMatch(/Campout · 3 days/);
    expect(html).toMatch(/Achievement/);
    expect(html).toMatch(/Service · 4 needed/);
  });

  it("renders RSVP / CoH / service action buttons as <td> blocks (Outlook-safe)", () => {
    // Each CTA is wrapped in a <td> with a background color so Outlook
    // 2016 doesn't drop the button.
    const tdButtons = html.match(/<td style="background:[^"]+border-radius:[^"]*">[^<]*<a/g) || [];
    expect(tdButtons.length).toBeGreaterThanOrEqual(3);
  });

  it("uses balanced-palette colors (slate + sky-blue, no chartreuse / forest)", () => {
    expect(html).toMatch(/#0f172a/i); // slate ink/primary
    expect(html).toMatch(/#1d4ed8/i); // sky-blue accent
    expect(html).not.toMatch(/#c8e94a/i);
    expect(html).not.toMatch(/#0e3320/i);
  });

  it("ships footer with Compass attribution + manage notifications + unsubscribe", () => {
    expect(html).toMatch(/Sent via.*Compass/);
    expect(html).toMatch(/Manage notifications/);
    expect(html).toMatch(/Unsubscribe/);
  });

  it("lang and meta viewport set so mobile renders sensibly", () => {
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/<meta name="viewport"/);
    // x-apple-disable-message-reformatting forces Apple Mail to keep
    // the carefully-sized template instead of expanding fonts.
    expect(html).toMatch(/x-apple-disable-message-reformatting/);
  });

  it("has exactly one <h1> (the issue headline)", () => {
    const h1s = html.match(/<h1[\s>][^]*?<\/h1>/g) || [];
    expect(h1s.length).toBe(1);
  });
});
