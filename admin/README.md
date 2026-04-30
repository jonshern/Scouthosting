# Compass — Admin Dashboard (static HTML/CSS prototype)

A self-contained static recreation of the **admin dashboard** surface from
the Compass rebrand &mdash; the Tuesday-evening view a unit committee chair
or scoutmaster lands on after signing in.

This folder is a hand-coded HTML/CSS recreation of the locked design at
`design/source/admin-pages.jsx → AdminBalanced` &mdash; using the
**Forest & Ember** palette from `design/source/tokens.js` (`bold`).

## What's in this folder

```
admin/
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
cd admin
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Google Fonts (Newsreader + Inter Tight)
load from the CDN; the page is otherwise self-contained.

## How to run the smoke test

```bash
# from repo root
npx vitest run --dir admin
```

That command picks up the root `vitest.config.js` automatically and runs
the assertions in well under a second.

## Page structure

The page mirrors `AdminBalanced` (the chosen variant) plus a roster preview
strip that surfaces the constant `ROSTER` data declared at the top of
`admin-pages.jsx`:

1. **Top nav** &mdash; wordmark + seven section tabs (Overview / Calendar /
   Roster / Messages / Photos / Forms / Money), Overview underlined in
   chartreuse and marked `aria-current="page"`. Right side: notification
   bell, search button, JM avatar.
2. **Greeting block** &mdash; dark-evergreen card with a "Troop 12 &middot;
   This week" pill, oversized italic-+-accent headline (`Tuesday, evening.`
   with the comma + word in chartreuse italic), context-aware deadline
   subhead, and dual CTAs ("Send reminder" + "+ New event").
3. **Stats row** &mdash; four cards (Scouts active / RSVPs needed / Account
   balance / Unread), each with a different secondary-spectrum top-border
   tone (sky / accent / butter / raspberry).
4. **Body grid** &mdash; two columns:
    - **Calendar** &mdash; "What's coming up." Four agenda items with a
      tone-tinted italic Newsreader date, name + meta, and a per-event
      progress bar showing replied/total.
    - **Activity** &mdash; "The last few hours." Six rows. Each carries a
      tone-tinted circular icon (cash, check, mail, clipboard) reflecting
      the kind of activity (payment, RSVP, message, form submission).
5. **Roster strip** &mdash; condensed table preview of the first seven
   scouts with patrol chips, rank, age, parent / guardian, last-seen.
   The README's full Roster view is its own admin surface; this dashboard
   strip is the at-a-glance preview.
6. **Footer** &mdash; "Compass admin · Troop 12 · signed in as Jenna M."
   plus the required *Independent · Not affiliated* disclaimer.

## Locked design choices honored

- **Palette:** Forest & Ember only. Deep evergreen `#0e3320` primary,
  chartreuse `#c8e94a` accent, warm cream `#f4ecdc` page bg, `#1d3a32`
  for the greeting card (matches AdminBalanced's `surfaceDark` reference).
- **Type:** Newsreader display with the italic-+-accent treatment on
  signature words (the comma in *Tuesday, evening.*, the en-dash in
  *32 scouts, three patrols.*), Inter Tight UI.
- **Greeting card:** chartreuse glow blooming from the corner; pill
  kicker; 64px headline; a single contextual deadline sentence in muted
  white; ghost + accent buttons.
- **Color-coded stats:** four different tones above the same neutral
  surface card, tied 1:1 with the JSX so the dashboard stays navigable
  by color (sky = directory, accent = RSVP, butter = money, raspberry =
  unread).
- **Color-coded calendar:** each event's italic date numeral + progress
  fill share its top-border tone &mdash; consistent with the unit-site
  events list.
- **Color-coded activity:** each row's icon block uses the same secondary
  spectrum mapping (teal = $, accent = check, raspberry = reply, butter =
  form, sky = ask, plum = sent).

## Anonymized content

Everything in `index.html` is mock data drawn directly from the
`admin-pages.jsx` constants &mdash; the same fictional roster (Mason Park,
Liam O'Brien, Owen Schmidt, Ethan Tran, Noah Garcia, Henry Chen, Isaac
White, Marcus Lee, Theo Rivera) and the same parents / dollar amounts /
event names. No real Scouting unit, lodge, or council appears.

## Accessibility hygiene

- Skip-link to `#main`
- One `<h1>` (the greeting); each subsection has an `<h2>`
- Decorative SVGs are `aria-hidden="true"`; icon-only buttons carry
  `aria-label`s
- Each event progress bar uses `role="progressbar"` with
  `aria-valuemin`/`max`/`now` so screen readers announce the RSVP coverage
- Active section tab carries `aria-current="page"` (Overview, in this view)
- Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<section>` per
  region, `<footer>`

## Responsive behavior

- `>= 1101px` &mdash; full desktop. Top nav inline, four-up stats,
  two-column body (calendar 1.5fr + activity 1fr), roster spans the full
  width.
- `721–1100px` &mdash; top nav wraps, body collapses to a single column,
  calendar and activity stack with a 32px gap.
- `<= 720px` &mdash; everything single-column. Greeting becomes
  vertical, stats become two-up, agenda items stack date / name / RSVP
  vertically, the roster table picks up a horizontal scroll bar so the
  table itself stays readable.

## What this prototype does **not** include

- No real auth (the avatar is a stub)
- No JavaScript interactivity
- No live data &mdash; everything is hard-coded mock
- No analytics, tracking, or third-party scripts
- The other admin views called out in the design README (Roster /
  Calendar editor / Messages / Photos / Forms / Finance) are still
  outstanding work; this prototype is the **Dashboard** view only, with
  a roster preview strip
