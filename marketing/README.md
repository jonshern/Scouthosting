# Compass — Marketing Site (static HTML/CSS prototype)

A self-contained static recreation of the **marketing site** surface from the
Compass rebrand &mdash; the public homepage at the apex domain (e.g.
`compass.app`) that volunteer leaders land on when they're shopping for a
hosting platform.

This folder is a hand-coded HTML/CSS recreation of the locked design at
`design/source/marketing-balanced.jsx` &mdash; using the **Forest & Ember**
palette from `design/source/tokens.js` (`bold`).

## What's in this folder

```
marketing/
├── index.html          The page itself — semantic HTML, single screen.
├── styles.css          All styling. Design tokens at the top as CSS custom
│                       properties (palette, type, spacing, shape).
├── README.md           This file.
└── tests/
    └── smoke.test.js   Vitest smoke test. Reads index.html via node:fs and
                        asserts required strings + section structure.
```

## How to view it

The page is fully static &mdash; no build, no JavaScript framework, no
bundler. Serve the folder with anything that talks HTTP:

```bash
cd marketing
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Google Fonts (Newsreader + Inter Tight)
load from the CDN; the page is otherwise self-contained.

## How to run the smoke test

The test is a single Vitest file that uses only `node:fs` (no jsdom, no
deps). It uses the root `vitest.config.js` (Node environment); the only
thing it needs is the directory to scan, because the root config's
`include` pattern is scoped to the legacy `tests/**/*.test.js` directory.

```bash
# from repo root
npx vitest run --dir marketing
```

That command picks up the root `vitest.config.js` automatically and runs
the assertions in well under a second.

## Page structure

The page mirrors `marketing-balanced.jsx`'s nine sections:

1. **Top nav** &mdash; wordmark / anchor links / Sign-in + Start-a-trial CTA
2. **Hero** &mdash; magazine-cover masthead row, oversized italic headline
   with an inline chartreuse accent block ("look like 2008."), security-
   first pill in the right column, dual CTAs, then a 3-up photo strip
   with spectrum-colored top borders
3. **Stats band** &mdash; dark forest. Four cells: AES-256 / SSO / Two-deep
   / $12, each with a different top-border tone
4. **Features** &mdash; four editorial blocks (01 Calendar / 02 Website /
   03 Messages / 04 Memories) with alternating image / text layout, oversized
   italic numerals tinted to each block's tone
5. **Migration band** &mdash; sand surface, list of platforms we import from
   (TroopWebHost, ScoutLander, TroopTrack, Wix/Squarespace, Google Sites,
   CSV/Excel, Scoutbook export, Internet Advancement, "a shared Drive folder")
6. **Pricing** &mdash; two tiers. Unit ($12 highlighted "MOST TROOPS") and
   District (Talk to us)
7. **Old-vs-new comparison** &mdash; dark forest. Two browser-window mocks
   side by side: the deliberately ugly TroopWebHost-style site (Times-on-
   green, table layouts, hit-counter footer, IE7+ stamp) vs. a clean Compass
   screenshot
8. **CTA** &mdash; closing pitch with a "Free for 30 days" pill, oversized
   headline, dual CTAs, "no credit card" fine print
9. **Footer** &mdash; wordmark + copyright + the required *Independent &middot;
   Not affiliated* disclaimer

## Locked design choices honored

- **Palette:** Forest & Ember only. Deep evergreen `#0e3320` primary,
  chartreuse `#c8e94a` accent, warm cream `#f4ecdc` page bg, dark forest
  `#1a1f1a` for inverted bands, `#1d3a32` for the comparison/stats band
  (matches `marketing-balanced.jsx`'s fallback for `surfaceDark`).
- **Type:** Newsreader for display (with the italic-+-accent treatment on
  signature words: *look like 2008.*, *volunteers actually need.*,
  *18 years*, *per-scout*, *is your front door.*, *before next week's meeting.*),
  Inter Tight for UI.
- **Magazine masthead row:** four-up dateline strip ("Volume 1 · Issue 04 ·
  The Compass Field Notes · Modern Software for Volunteer Units · Independent
  · Not affiliated with BSA") above the hero headline.
- **Stat tiles:** each gets a different secondary-spectrum top border
  (accent / sky / butter / teal).
- **Editorial features:** alternating image-left / text-left layout,
  oversized italic numerals (01–04), corner chip ribbons (CALENDAR /
  WEBSITE / MESSAGES / MEMORIES) tinted to the section tone.
- **Old vs new comparison:** the antagonist is the *category* of legacy
  hosting (`oldhostingplatform.com`), never a real vendor. Anonymized to
  `Troop 12 / Anytown` so it stays consistent with the unit-site mock.
- **Disclaimer:** present in the footer per the brief.

## Anonymized content

Everything in `index.html` is mock copy. There is no real testimonial, no
real customer logo, and the only unit identity referenced is the same
`Troop 12 / Anytown` pairing used in the public-unit-site mock.

| Field                               | This file                       |
| ----------------------------------- | ------------------------------- |
| Old-site mock URL                   | `oldhostingplatform.com`        |
| Old-site unit                       | Troop 12 - Anytown, USA         |
| New-site mock URL                   | `troop12.compass.app`           |
| New-site featured event             | Spring Campout — Birch Lake SP  |
| Eagle name in old-site events table | Jamie (fictional Scout)         |

No real Scouting America council, lodge, or unit is named.

## Accessibility hygiene

- Skip-link to `#main`
- One `<h1>` (the hero headline); subsections each have an `<h2>`
- Decorative SVGs are `aria-hidden="true"`; the comparison browser frames
  carry `role="img"` + a descriptive `aria-label` (the visual contains
  meaningful information about the old-vs-new contrast)
- Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<section>` per
  section, `<article>` for feature and pricing-tier blocks, `<aside>` for
  the menu inside the old-site mock, `<footer>`
- Focus styles preserved on the keyboard-only skip link; buttons inherit
  `:focus-visible` outlines via their hover styles

## Responsive behavior

The mocks in `marketing-balanced.jsx` are 1200px desktop. This recreation
collapses gracefully:

- `>= 1025px` &mdash; full desktop. Two-column hero, four-up stats,
  alternating feature blocks, two-up pricing, two-up comparison.
- `641–1024px` &mdash; hero stacks (headline above aside), stats become
  two-up, every feature stacks image-above-copy, migration becomes single-
  column, pricing collapses to one column, comparison stacks vertically.
- `<= 640px` &mdash; everything single-column. Hero photo strip becomes a
  single tile, masthead wraps, type sizes scale down so the largest
  display still fits a 360-wide viewport.

## What this prototype does **not** include

- No real auth ("Sign in" link is a stub)
- No JavaScript interactivity beyond the skip-link's native focus jump
- No analytics, tracking, or third-party scripts (per the security stance
  in the design README &mdash; "no advertising, no third-party trackers")
- No live signup form &mdash; the existing `signup.html` at the repo root
  remains the real signup endpoint until the marketing site is wired into
  the production server
