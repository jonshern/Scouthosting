# Compass — Security &amp; Trust page (static HTML/CSS prototype)

A self-contained static recreation of the **security &amp; trust** surface
from the Compass rebrand &mdash; the page a committee chair, treasurer, or
parent volunteer can read in five minutes to understand what we do with
troop and family information.

This folder is a hand-coded HTML/CSS recreation of the locked design at
`design/source/security.jsx → SecurityCard` &mdash; using the
**Slate &amp; Sky** palette from `design/source/tokens.js` (`balanced`).

## What's in this folder

```
security/
├── index.html          The page itself — semantic HTML, single screen.
├── styles.css          All styling. Design tokens at the top as CSS custom
│                       properties (palette, type, spacing, shape).
├── README.md           This file.
└── tests/
    └── smoke.test.js   Vitest smoke test. Reads index.html via node:fs and
                        asserts required strings + section structure.
```

## How to view it

```bash
cd security
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Google Fonts (Newsreader + Inter Tight)
load from the CDN; the page is otherwise self-contained.

## How to run the smoke test

```bash
# from repo root
npx vitest run --dir security
```

That command picks up the root `vitest.config.js` automatically and runs
the assertions in well under a second.

## Page structure

The page mirrors `SecurityCard` in `security.jsx` &mdash; eight content
sections plus a footer:

1. **Page header** &mdash; slate band with a topographic line backdrop,
   wordmark, "Trust &amp; Safety" pill, oversized italic-+-accent headline
   ("Built for *youth&nbsp;safety*, first.") and a five-minute-read promise.
2. **Promises** &mdash; two-column list. Five "always do" with green check
   marks; five "never do" with red &times; marks. Same tone as the
   plain-language voice in the brief.
3. **Audience table** &mdash; 7 information fields &times; 4 audiences
   (stranger / parent / leader / committee chair). Each cell uses a coded
   badge: green "Yes" or "First + initial", butter "Opt-in", sky-soft
   "Own family", neutral "No".
4. **Sign-in &amp; accounts** &mdash; two-column. Plain-language SSO + 2FA
   explanation alongside the "five-minute test" callout: *"If a leader's
   phone is stolen at a campout, what happens?"*
5. **What happens to your data** &mdash; three plain cards: Locked,
   Logged, Yours. Italic sky-blue card titles end with a period
   (`Locked.` / `Logged.` / `Yours.`) per the locked design.
6. **Youth protection** &mdash; four cards covering the defaults a
   Scoutmaster would set on by default: no public contact info, photo
   opt-in, two-deep messaging, background-check status visibility.
7. **If something goes wrong** &mdash; an incident-response timeline with
   four sky-blue italic windows (1h / 24h / 72h / 30d) and the
   plain-English commitment for each.
8. **Independent checks** &mdash; four certification / compliance cards
   (SOC 2 Type II, PCI, parent-consent, GDPR/CCPA) plus a sand-tinted
   "for the technical reader" callout pointing at <security@compass.app>
   for the architecture brief.
9. **Footer** &mdash; "Last reviewed by our security team &middot; April
   2026", the security email, and the required *Independent &middot; Not
   affiliated* disclaimer.

## Locked design choices honored

- **Palette:** Slate &amp; Sky only. Slate primary `#0f172a` primary,
  sky-blue `#1d4ed8` accent, cool light gray `#f7f8fa` page bg, `#0f172a`
  for the dark header band.
- **Type:** Newsreader display with the italic-+-accent treatment on
  signature words (*youth&nbsp;safety*, *Locked.*, *Logged.*, *Yours.*,
  *We will never*), Inter Tight for UI / body.
- **Plain-language voice.** No jargon in the body copy &mdash; the
  technical reader gets a single labelled callout at the bottom that
  points at the architecture brief.
- **Color-coded badges in the audience table** map 1:1 with the JSX
  `cell()` helper (lines 226&ndash;232): green = yes, butter = opt-in,
  sky-soft = own family, neutral line-soft = no.
- **Topographic line backdrop** on the header band echoes the editorial
  feel of the marketing hero without competing with the headline.

## Anonymized content

There is no real council, lodge, troop, leader, or scout name on this
page. All examples are role-shaped (*"a parent in the troop"*, *"a
committee chair"*) rather than person-shaped.

## Accessibility hygiene

- Skip-link to `#main`
- One `<h1>` (the page headline); each section has its own `<h2>`,
  cards use `<h3>`
- Decorative SVGs are `aria-hidden="true"`
- The audience table uses real `<th scope="col">` for the audience
  columns and `<th scope="row">` for the information labels &mdash; so a
  screen reader announces "Phone &amp; address, A registered leader: Yes"
  rather than just "Yes"
- Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<section>` per
  region, `<article>` for each card, `<footer>`

## Responsive behavior

- `>= 1025px` &mdash; full desktop. Two-column promises grid, four-up
  audience columns, two-column sign-in + youth-protection blocks,
  three-up data cards, four-up checks.
- `641&ndash;1024px` &mdash; promises, sign-in, and YPT collapse to a
  single column. Plain cards stack. Checks become two-up. Audience
  table picks up a horizontal scroll.
- `<= 640px` &mdash; everything single-column. Display sizes scale
  down (64px headline &rarr; 36px). The four IR windows align with a
  narrower (100px) label rail so the long sentences still wrap cleanly.

## What this prototype does **not** include

- No real auth
- No JavaScript interactivity
- No analytics, tracking, or third-party scripts (consistent with the
  page's own claims)
- No live status feed or post-mortem stream &mdash; the IR section
  describes the policy, not real incidents
