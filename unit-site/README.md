# Compass — Public Unit Site (static HTML/CSS prototype)

A self-contained static recreation of the **public unit site** surface from the
Compass rebrand. This represents the "front door" a single Scouting unit gets
on its custom subdomain (e.g. `12.compass.app`).

This folder is a hand-coded HTML/CSS recreation of the locked design at
`design/source/troop-pages.jsx → TroopBalanced` — the dark-forest hero
variant — using the **Slate & Sky** palette from
`design/source/tokens.js` (`balanced`).

## What's in this folder

```
unit-site/
├── index.html          The page itself — semantic HTML, one screen.
├── styles.css          All styling. Design tokens at the top as CSS custom
│                       properties (palette, type, spacing, shape).
├── README.md           This file.
└── tests/
    └── smoke.test.js   Vitest smoke test. Reads index.html via node:fs and
                        asserts required strings + heading hierarchy.
```

## How to view it

The page is fully static — no build, no JavaScript framework, no bundler.
Serve the folder with anything that talks HTTP. The simplest:

```bash
cd unit-site
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Google Fonts (Newsreader + Inter Tight)
load from the CDN; the page is otherwise self-contained.

## How to run the smoke test

The test is a single Vitest file that uses only `node:fs` (no jsdom, no
deps). It uses the root `vitest.config.js` (Node environment, no extra
setup); the only thing that needs to be passed is the directory to scan,
because the root config's `include` pattern is scoped to the legacy
`tests/**/*.test.js` directory.

```bash
# from repo root
npx vitest run --dir unit-site
```

That command picks up the root `vitest.config.js` automatically and runs
this file's 14 assertions in well under a second.

It checks:

- The page contains the required strings: `Troop 12`, `Compass`, and the
  `Independent · Not affiliated with Scouting America or BSA.` disclaimer
- Heading hierarchy: exactly one `<h1>`, plus at least one `<h2>` per major
  section (about, events, news, gallery)
- Each of the seven required sections is present
- Both Newsreader and Inter Tight fonts are loaded
- A skip link exists for keyboard users

## Anonymized vs. dynamic content

Everything in `index.html` is **mock content for the prototype**. In
production these fields come from the unit's row in the `Unit` table plus
its content (events, news, photo albums) authored in the admin dashboard.

| Field                         | This file                    | Source in production                        |
| ----------------------------- | ---------------------------- | ------------------------------------------- |
| Unit name                     | Scouts BSA Troop 12          | `Unit.name`                                 |
| City / founded                | Anytown, USA · Est. 1962     | `Unit.city`, `Unit.foundedYear`             |
| Sponsor / chartered org       | St. Mark's Community Church  | `Unit.sponsor`                              |
| Address                       | 101 Main Street, Anytown USA | `Unit.address`                              |
| Council                       | Cedar Bluff Council          | `Unit.council` (fictional in this mock)     |
| Leaders                       | Mr. Avery / Brooks / Carter  | `Membership` rows where role in (SM/ASM/CM) |
| Scouts referenced in news     | Sam, Max, Jamie, Alex        | `User` rows (no real youth surfaced)        |
| Upcoming events (5 items)     | hard-coded                   | `Event` rows where `startsAt > now()`       |
| News items (3 items)          | hard-coded                   | `Announcement` rows ordered by `publishedAt`|
| Photo gallery (9 placeholders)| inline gradient + SVG        | `Photo` rows scoped to the unit             |

All names follow the brief's anonymization rule: fictional adults
(Mr. Avery / Mr. Brooks / Ms. Carter) and fictional kids (Sam / Max / Jamie /
Alex). The council "Cedar Bluff Council" is invented and not a real BSA
council.

## Photos

There are **no real image binaries** in this prototype. Each photo tile is a
gradient block plus a tiny inline SVG metaphor (mountain ridge, campfire,
canoe, etc.) plus a label — exactly the approach used in
`design/source/atoms.jsx` `<Photo />`. Each tile has a colored top border
drawn from the secondary spectrum (sky / ember / raspberry / butter / plum /
teal / accent) so the gallery reads as deliberate, not broken.

## Locked design choices honored

- **Palette:** Slate & Sky only. Slate primary `#0f172a` primary,
  sky-blue `#1d4ed8` accent, cool light gray `#f7f8fa` page bg, slate
  `#eef1f5` for inverted bands.
- **Type:** Newsreader for display (with italic-+-accent treatment on
  signature words like *Troop 12.*, *about.*, *events.*, *announcements.*,
  *gallery.*), Inter Tight for UI.
- **Hero numeric watermark:** the "12" rendered at 480 px italic Newsreader
  with 0.10 opacity, top-right corner.
- **Event color-coding:** each upcoming event uses one of the secondary
  spectrum tones for its date numeral and the right-edge accent bar.
- **Disclaimer:** present in the footer per the brief.
- **Inverted dark band:** the events section sits on `#eef1f5` for visual
  rhythm between the cream sections, matching the README's "Inverted dark
  bands appear at section transitions" guidance.

## Accessibility hygiene

- Skip-link to `#main`
- One `<h1>` (the unit name); subsections each have an `<h2>`
- Decorative SVGs are `aria-hidden="true"`; the photo `<figure>`s have
  `role="img"` + `aria-label` describing the subject
- Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<section>` per
  section, `<article>` for news items, `<aside>` for the sponsor card,
  `<footer>`
- Focus styles preserved on the keyboard-only skip link

## Responsive behavior

The mocks in `troop-pages.jsx` are 1200px desktop. This recreation collapses
gracefully:

- `>= 1025px` — full desktop grid (about + sponsor side-by-side, 3-column
  news, 3-column gallery)
- `641–1024px` — sponsor card stacks under about, gallery stays 3-up,
  display sizes scale down
- `<= 640px` — single-column everywhere, hero watermark shrinks to fit the
  viewport, gallery becomes 2-up, top bar nav wraps below the brand

## What this prototype does **not** include

- No real auth (the "Sign in" link is a stub)
- No JavaScript interactivity beyond the skip-link's native focus jump
- No service worker / no offline cache
- No analytics, tracking, or third-party scripts (per the security stance in
  the design README — "no advertising, no third-party trackers")
