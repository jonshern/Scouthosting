// Static smoke tests for the new admin pages built from the design
// handoff: newsletter (flagship), feedback (public roadmap), calendar
// (month grid + RSVP roster), and page-builder (4-step flow).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function load(name) {
  return readFileSync(resolve(root, "admin", name), "utf8");
}

describe("admin/newsletter.html (flagship AI digest scheduler)", () => {
  const html = load("newsletter.html");

  it("declares the balanced palette and links shared tokens before page styles", () => {
    expect(html).toMatch(/<html[^>]+data-palette="balanced"/);
    const tokenIdx = html.indexOf('href="/tokens.css"');
    const stylesIdx = html.indexOf('href="styles.css"');
    expect(tokenIdx).toBeGreaterThan(0);
    expect(stylesIdx).toBeGreaterThan(tokenIdx);
  });

  it("ships the four newsletter sections (subnav: schedule, draft, rules, sent)", () => {
    expect(html).toContain("Schedule");
    expect(html).toContain("This week's draft");
    expect(html).toContain("Reminders &amp; rules");
    expect(html).toContain("Sent");
  });

  it("renders the drafting-now hero status card", () => {
    expect(html).toMatch(/Drafting now/i);
    expect(html).toMatch(/ready Sun 7 AM/i);
    // Headline mirrors newsletter.jsx → NewsletterSchedule line 100.
    expect(html).toContain("Spring Campout this Friday");
  });

  it("lists upcoming sends with their kind tags (auto / reminder / recap)", () => {
    expect(html).toContain("Auto digest");
    expect(html).toContain("Reminder");
    expect(html).toContain("Auto recap");
  });

  it("ships the audience picker, brand preview, and 6-week stats sparkline", () => {
    expect(html).toContain("All troop families");
    expect(html).toContain("Adult leaders only");
    expect(html).toContain("The Weekly Trail Mix");
    expect(html).toContain("Open rate");
    expect(html).toMatch(/76%/);
  });

  it("links to the other new admin pages (calendar, feedback)", () => {
    expect(html).toContain('href="/admin/calendar.html"');
    expect(html).toContain('href="/admin/feedback.html"');
  });

  it("has exactly one <h1>", () => {
    const h1s = html.match(/<h1[\s>][^]*?<\/h1>/g) || [];
    expect(h1s.length).toBe(1);
  });
});

describe("admin/feedback.html (public roadmap board + composer modal)", () => {
  const html = load("feedback.html");

  it("declares the balanced palette and links shared tokens", () => {
    expect(html).toMatch(/<html[^>]+data-palette="balanced"/);
    expect(html).toContain('href="/tokens.css"');
  });

  it("renders all four status pills (submitted / triaged / building / shipped)", () => {
    expect(html).toContain('class="fb-status fb-status--submitted"');
    expect(html).toContain('class="fb-status fb-status--triaged"');
    expect(html).toContain('class="fb-status fb-status--building"');
    expect(html).toContain('class="fb-status fb-status--shipped"');
  });

  it("decorates the caller's own request with a 'Your request' tag", () => {
    expect(html).toMatch(/Your request/);
    expect(html).toMatch(/class="fb-row fb-row--mine"/);
  });

  it("decorates rows the caller has voted on with a 'You voted' tag", () => {
    expect(html).toMatch(/You voted/);
    expect(html).toMatch(/class="fb-vote__btn fb-vote__btn--voted"/);
  });

  it("ships an inline composer modal with type toggle and category picker", () => {
    expect(html).toMatch(/id="composer"/);
    expect(html).toContain("Feature request");
    expect(html).toContain("Bug report");
    expect(html).toContain("Get help now");
    expect(html).toContain("Public roadmap");
  });

  it("uses 8 example requests and at least 3 status updates", () => {
    const rows = html.match(/class="fb-row(?:[^"]*)"/g) || [];
    expect(rows.length).toBeGreaterThanOrEqual(8);
    const updates = html.match(/class="fb-update fb-update--/g) || [];
    expect(updates.length).toBeGreaterThanOrEqual(3);
  });

  it("ships a live-data bootstrap script that wires the page to /api/v1/feedback", () => {
    // The static rows above are a fallback; the bootstrap replaces
    // them with real FeedbackRequest data on load. Asserts:
    expect(html).toMatch(/id="fb-list"/);
    expect(html).toContain("/api/v1/feedback");
    // Vote click handler delegates on [data-vote] so it works on
    // freshly rendered rows.
    expect(html).toMatch(/closest\('\[data-vote\]'\)/);
    // POST endpoint for the composer submit.
    expect(html).toMatch(/method:\s*['"]POST['"]/);
    // Cookie-authed (no Bearer header in the static page — the leader
    // session cookie carries the auth).
    expect(html).toMatch(/credentials:\s*['"]same-origin['"]/);
  });

  it("has exactly one <h1>", () => {
    const h1s = html.match(/<h1[\s>][^]*?<\/h1>/g) || [];
    expect(h1s.length).toBe(1);
  });
});

describe("admin/calendar.html (month grid + RSVP roster)", () => {
  const html = load("calendar.html");

  it("declares the balanced palette and links shared tokens", () => {
    expect(html).toMatch(/<html[^>]+data-palette="balanced"/);
    expect(html).toContain('href="/tokens.css"');
  });

  it("renders five week-rows for a March 2026 month grid", () => {
    const weeks = html.match(/class="cal-week"/g) || [];
    expect(weeks.length).toBe(5);
  });

  it("color-codes events by category", () => {
    expect(html).toContain("cal-event--meeting");
    expect(html).toContain("cal-event--outing");
    expect(html).toContain("cal-event--service");
    expect(html).toContain("cal-event--court");
    expect(html).toContain("cal-event--sports");
    expect(html).toContain("cal-event--leader");
  });

  it("highlights today's cell", () => {
    expect(html).toContain("cal-cell--today");
  });

  it("renders multi-day campout (Spring Campout) across consecutive cells", () => {
    expect(html).toMatch(/Spring Campout/);
    // Three day-spans for Mar 20/21/22.
    const campoutCells = html.match(/Spring Campout/g) || [];
    expect(campoutCells.length).toBeGreaterThanOrEqual(3);
  });

  it("ships the sticky event-detail panel with RSVP roster + two-deep banner", () => {
    expect(html).toMatch(/class="cal-detail"/);
    expect(html).toMatch(/Tomahawk Scout Reservation/);
    // Two-deep YPT banner is the safety-critical reassurance for this view.
    expect(html).toMatch(/Two-deep verified/);
    // RSVP roster has at least 5 rows.
    const roster = html.match(/class="cal-rost-row"/g) || [];
    expect(roster.length).toBeGreaterThanOrEqual(5);
    // All four RSVP states render.
    expect(html).toContain("cal-rost-row__status--yes");
    expect(html).toContain("cal-rost-row__status--no");
    expect(html).toContain("cal-rost-row__status--maybe");
    expect(html).toContain("cal-rost-row__status--pending");
  });

  it("includes left-rail filters (My RSVPs, Eagle candidates, Hidden from public)", () => {
    expect(html).toMatch(/My RSVPs only/);
    expect(html).toMatch(/Eagle candidates/);
    expect(html).toMatch(/Hidden from public/);
  });

  it("has exactly one <h1>", () => {
    const h1s = html.match(/<h1[\s>][^]*?<\/h1>/g) || [];
    expect(h1s.length).toBe(1);
  });
});

describe("admin/page-builder.html (4-step site builder)", () => {
  const html = load("page-builder.html");

  it("declares the balanced palette and links shared tokens", () => {
    expect(html).toMatch(/<html[^>]+data-palette="balanced"/);
    expect(html).toContain('href="/tokens.css"');
  });

  it("ships exactly four step radios (Theme · Content · Polish · Publish)", () => {
    const radios = html.match(/<input type="radio" name="pb-step"/g) || [];
    expect(radios.length).toBe(4);
    expect(html).toMatch(/for="pb-step-1">1 · Theme</);
    expect(html).toMatch(/for="pb-step-2">2 · Content</);
    expect(html).toMatch(/for="pb-step-3">3 · Polish</);
    expect(html).toMatch(/for="pb-step-4">4 · Publish</);
  });

  it("step 1 defaults to checked so the theme picker shows on load", () => {
    expect(html).toMatch(/<input type="radio" name="pb-step" id="pb-step-1" checked/);
  });

  it("step 1 ships four lead themes each with name + swatches + tagline", () => {
    expect(html).toContain("Heritage Patch");
    expect(html).toContain("Modern Trail");
    expect(html).toContain("Campfire");
    expect(html).toContain("Eagle Pride");
    // Heritage Patch is the recommended (selected) theme.
    expect(html).toContain("pb-theme-card--selected");
    expect(html).toMatch(/most-loved/i);
  });

  it("step 2 ships the block library with 10 categories + AI-assist nudge", () => {
    const cats = html.match(/class="pb-cat[^"]*"/g) || [];
    expect(cats.length).toBeGreaterThanOrEqual(10);
    expect(html).toContain("Ask Compass");
  });

  it("step 2 includes 'live data' tile pills for Compass-tied blocks", () => {
    const liveTiles = html.match(/class="pb-tile__live"/g) || [];
    expect(liveTiles.length).toBeGreaterThanOrEqual(4);
  });

  it("step 3 (AI assist) includes a textarea and starter prompts", () => {
    expect(html).toContain('class="pb-ai-input"');
    expect(html).toMatch(/class="pb-ai-suggestion"/);
    // At least 4 starter prompts.
    const starters = html.match(/class="pb-ai-suggestion"/g) || [];
    expect(starters.length).toBeGreaterThanOrEqual(4);
  });

  it("step 4 (publish) summarises theme + sections + domain + live data", () => {
    expect(html).toContain("Publishing summary");
    expect(html).toContain("troop12.compass.app");
    expect(html).toContain("Heritage Patch");
    expect(html).toMatch(/Publish to .*\.compass\.app/);
  });

  it("CSS rules show only one pane at a time based on which step is checked", () => {
    expect(html).toMatch(/#pb-step-1:checked/);
    expect(html).toMatch(/#pb-step-2:checked/);
    expect(html).toMatch(/#pb-step-3:checked/);
    expect(html).toMatch(/#pb-step-4:checked/);
  });

  it("does not regress to the bold palette", () => {
    expect(html).not.toMatch(/#c8e94a/i);
  });
});

describe("Cross-page consistency (admin nav)", () => {
  const newsletter = load("newsletter.html");
  const feedback = load("feedback.html");
  const calendar = load("calendar.html");

  it("admin sidebar nav cross-links the three new admin pages", () => {
    for (const html of [newsletter, feedback, calendar]) {
      expect(html).toContain('href="/admin/newsletter.html"');
      expect(html).toContain('href="/admin/feedback.html"');
      expect(html).toContain('href="/admin/calendar.html"');
    }
  });
});
