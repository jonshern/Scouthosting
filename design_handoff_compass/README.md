# Handoff: Compass — Scout Troop Hosting Platform

## Overview

**Compass** is a SaaS replacement for legacy scout-troop website hosts (e.g. TroopWebHost). It serves three audiences in one product:

1. **Marketing site** — sells the platform to scoutmasters and committee chairs
2. **Public troop pages** — what the public/parents see when a troop is hosting their site (e.g. `troop567.compass.app` or `troop567.org`)
3. **Admin app** — what scoutmasters, committee, and leaders use day-to-day to run the troop

The product sits *next to* Scoutbook (the official BSA advancement tool), not on top of it. Compass syncs with Scoutbook for roster + advancement and focuses on the things Scoutbook is bad at: the troop website, calendar/RSVPs, parent communications, photos, and a weekly auto-newsletter.

### Differentiating positioning

The marketing site leads with **"no commodity markups"** — we pass DNS, custom domains, and email-on-your-own-domain through at cost (or free) instead of marking them up like legacy hosts do. The pricing is **$99/yr flat** with **15 GB storage included** and **BYO custom domain at no markup**.

The flagship feature is the **AI-drafted weekly newsletter**: Compass reads the troop's calendar, RSVPs, photos, and Scoutbook achievements, drafts the Sunday email, and the leader spends 5 minutes reviewing before hitting send.

---

## About the design files

The files in `designs/` are **design references created in HTML/JSX** as prototypes — they show the intended look, copy, layout, and behavior. They are **not production code to copy directly**.

Your task is to **recreate these designs in the target codebase's existing environment** (or, if greenfield, in the most appropriate framework — likely Next.js + Tailwind + shadcn/ui for a SaaS product like this) using its established patterns, libraries, and component primitives.

The designs were built using:
- **React 18** loaded inline via UMD + Babel standalone (so the prototypes run in a browser tab without a build step)
- A **`<DCArtboard>` / `<DCSection>`** "design canvas" wrapper that lays out artboards in a pannable/zoomable grid for review — this is **prototype scaffolding, not part of the product**
- Inline styles with shared design tokens from `tokens.js`
- **No real backend** — all data is hard-coded inline for visual mockup purposes

When implementing:
- Drop the design-canvas wrapper entirely
- Lift the **content of each `<DCArtboard>`** as the actual screen
- Convert inline-styles to whatever the codebase uses (Tailwind classes, CSS modules, styled-components, etc.) using the design tokens documented below
- Replace hard-coded data with real fetches/queries

---

## Fidelity

**High fidelity.** Final colors, typography, spacing, copy, and interactions are intended to match these mocks closely. Specifically:

- All **copy is final** (or near-final) — the headlines, body text, button labels, and microcopy were written carefully and should be lifted as-is
- All **colors are final** — exact hex values in `tokens.js`
- All **typography is final** — Newsreader (display serif) + Inter Tight (UI sans) + JetBrains Mono
- **Layout/spacing** are intended-final but should be adapted responsively (the mocks are mostly fixed at 1440 desktop / 402 mobile widths)
- **Interactions** are described per-screen below; animation specifics can use the codebase's defaults

---

## Tech & implementation suggestions

For a greenfield implementation, suggested stack:

- **Framework:** Next.js 14 (App Router) — three route groups: `(marketing)`, `(troop)/[troopSlug]`, `(admin)/[troopSlug]/admin`
- **Styling:** Tailwind CSS + shadcn/ui primitives, with the `tokens.js` palette ported to `tailwind.config.js` theme extensions
- **Fonts:** `next/font` for Newsreader (Google Fonts), Inter Tight (Google Fonts), JetBrains Mono (Google Fonts)
- **Auth:** Clerk or Auth.js — needs role-based (Scoutmaster, Committee, Leader, Parent)
- **DB:** Postgres (Supabase or Neon) + Drizzle/Prisma
- **Email:** Postmark (transactional) — must support per-troop sending domains for the BYO-domain feature
- **File storage:** S3 + CloudFront for photos; auto-resize on upload via Sharp/Lambda
- **Multi-tenancy:** Subdomain routing (`troop567.compass.app`) **and** custom-domain support (CNAME → Caddy/Cloudflare for SaaS for cert termination)
- **Custom domain setup:** Customer adds a CNAME record at their registrar, Compass auto-provisions a Let's Encrypt cert. Marginal cost ≈ $0/yr/troop; never charge extra for this.
- **AI integration:** Anthropic Claude (`claude-sonnet-4` or current) for newsletter draft generation. Token cost is the open question — see "Open questions" below.
- **Scoutbook sync:** Scoutbook API access is gated by BSA — assume manual export/import as fallback, real API integration once approved.

---

## Design tokens

### Palettes

The product ships with **three palette options** in `tokens.js`. The user has not yet committed to one — implement the architecture so palettes can swap, but **lead with `balanced` (Slate & Sky)** as the current default in mocks:

#### `balanced` — Slate & Sky (current default)

```js
bg: '#f7f8fa'           // very light cool gray (page background)
surface: '#ffffff'      // card/panel
surfaceAlt: '#eef1f5'   // hover/inset cool gray
surfaceDark: '#0f172a'  // inverted blocks
ink: '#0f172a'          // primary text (near-black slate)
inkSoft: '#334155'      // body text
inkMuted: '#64748b'     // metadata/labels
line: '#e2e8f0'         // borders
lineSoft: '#eef1f5'     // dividers
primary: '#0f172a'      // primary buttons/text
accent: '#1d4ed8'       // sky/royal blue — bold pop
accentSoft: '#bcd0f4'
ember: '#f59e0b'        // amber — single warm contrast
emberSoft: '#fde68a'
danger: '#dc2626'
success: '#059669'
teal: '#0891b2'
```

#### `safe` — Pine & Brass (heritage option)

```js
bg: '#f5f1e8' (warm cream), primary: '#1f4d2c' (pine), accent: '#b8862b' (brass)
```

#### `bold` — Evergreen & Spectrum (modern option, multi-color)

```js
bg: '#f4ecdc', primary: '#0e3320' (deep evergreen), accent: '#c8e94a' (chartreuse)
+ secondary spectrum: sky #3a7ab8, ember #e07a3c, raspberry #c43d6b, butter #f3c54a, plum #6e3b7a, teal #3aa893
```

Full hex values for all three palettes are in `designs/tokens.js`.

### Typography

```js
display: '"Newsreader", "Source Serif Pro", Georgia, serif'
ui:      '"Inter Tight", "Inter", system-ui, sans-serif'
mono:    '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace'
```

**Usage rules:**
- **Newsreader** (display serif, italic-friendly) — ALL hero headlines, section titles, marketing taglines, feature card titles. Often italicized for the punch-line word (e.g. *"What gets built next is up to you."*). Weights: 400 (regular), 500 (medium). Letter-spacing: `-0.02em` on large sizes.
- **Inter Tight** — all UI text, body copy, labels, buttons, form fields. Weights: 400, 500, 600, 700.
- **JetBrains Mono** — counters, numeric stats, inline code, tag chips, "0 of 8" indicators. Weight 400 only.

### Spacing & radii

The mocks use these consistently (no formal scale was defined — these are observed):
- **Border radius:** `4px` (chips), `6–8px` (form fields, small buttons), `10–12px` (cards, panels), `14–16px` (large cards, modals)
- **Card padding:** typically `16–24px` interior; sections `28–48px`
- **Spacing scale:** essentially `4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 24 / 28 / 32 / 36 / 40 / 48 / 60` px — round to a Tailwind-ish 4px scale on implementation

### Shadows

Subtle and used sparingly:
- `0 1px 0 rgba(0,0,0,0.08)` — buttons (subtle bottom edge)
- `0 1px 3px rgba(0,0,0,0.06)` — small cards
- `0 4px 12px rgba(0,0,0,0.08)` — modals (light)
- `0 24px 60px rgba(0,0,0,0.18)` — large modals/composers

---

## Sections / artboards

The design canvas is organized into **named sections**, each with multiple artboards. Each artboard is a single screen/state. Below is the index — see the JSX files for exact layouts and the HTML file for the wiring.

### 1. Marketing site (3 directional explorations)

**Files:** `marketing-safe.jsx`, `marketing-balanced.jsx`, `marketing-bold.jsx`

Three full-bleed marketing landing pages, one per palette/tone direction. The **balanced** version is the current lead. Each contains:
- Hero (headline, sub, primary CTA, hero visual)
- "Why Compass" feature grid
- Pricing snippet with link to full plans page
- Quote/testimonial block
- Footer CTA

When implementing, ship **one** marketing page (start with `marketing-balanced.jsx` as the source of truth) — the other two are alternates for design review.

### 2. Public troop pages (`troop-pages.jsx`)

What the public sees at `troop567.compass.app` (or the custom domain). Sections:
- **Home** — hero with troop name, mission, next-event card, recent photos, "How to join" callout
- **About** — troop history, charter org, leadership grid, scout values
- **Calendar** — upcoming events (public view, no scout names on private events)
- **Photos** — grid by event
- **Join** — inquiry form

### 3. Admin app (`admin-pages.jsx`)

The day-to-day app for leaders. Sections:
- **Dashboard** — greeting, weekly stats, action items, upcoming events, recent activity
- **Calendar (admin)** — event editing, RSVP roster, two-deep enforcement
- **People** — roster, profile drawer, add/invite
- **Communications** — message composer, audience picker
- **Site editor** — see Page Builder section
- **Photos** — upload, organize, permissions
- **Settings** — troop profile, branding, custom domain

### 4. Page Builder (`page-builder.jsx`, `page-builder-v2.jsx`)

The drag-and-drop public-site editor. Two artboards:
- **v1** — initial concept (block-based)
- **v2** — current direction with section editor and template chooser. v2 is the lead.

### 5. Plans & pricing (`plans.jsx`)

Public-facing pricing page with three tiers (Troop / Troop + AI / Council) plus an inline "what's settled · what's open" working sidebar (this internal sidebar should be **omitted in production** — it's a working-doc artifact). Includes a storage dashboard mock for the admin.

### 6. Positioning page (`positioning.jsx`)

Long-form "no commodity markups" essay/page that breaks out:
- Custom domains (cost: ~2¢/yr) — included free
- Photo storage (cost: ~$2/troop/yr at S3 prices) — 15 GB included, modest markup
- Email on your own domain (cost: ~$9/yr/troop via Postmark) — included free
- Caveat: "we mark up storage modestly because it actually costs us money — and we tell you so"

### 7. Auto-newsletter (`newsletter.jsx`) — **flagship AI feature**

Four artboards:
- **Schedule overview** — the weekly digest's recurring schedule, upcoming send, pause/resume
- **Draft review** (the magic) — the AI-drafted Sunday digest with editable blocks (calendar pulls, RSVP nudges, photo highlights, Scoutbook achievements) and source attribution per block
- **Reminders & rules** — rule-based auto-emails (RSVP nudges, dues reminders, post-campout recap)
- **Recipient view** — what families see in iOS Mail (sender = `scoutmaster@troop567.org`, not `compass.app`)

### 8. In-app feedback & roadmap (`feedback.jsx`) — **trust-building feature**

Two artboards:
- **Public roadmap board** — voting list with status pills (Submitted / Triaged / Building / Shipped), real engineering update notes per item, "your request" + "you voted" badges
- **New request composer** — modal with type toggle (Feature / Bug / Get help now), category + visibility pickers, body, attach screenshots/screen-recordings, "we'll auto-attach context" disclosure

### 9. Mobile parent app (`mobile-app.jsx`, `mobile-feed.jsx`, `mobile-calendar-v2.jsx`, `mobile-chat.jsx`)

iOS-frame mockups (`ios-frame.jsx` provides the bezel) of the parent-facing mobile app:
- **Feed** — chronological feed of troop activity (events, photos, achievements, news)
- **Calendar** — month/week views, event detail with RSVP
- **Chat** — two-deep-enforced messaging with leaders
- **Profile** — scout's record, advancement, photos

### 10. Email templates (`email.jsx`)

HTML email designs for:
- Weekly digest (the auto-newsletter output)
- RSVP confirmation
- Dues reminder
- Welcome email

### 11. Security page (`security.jsx`)

Public marketing/legal page on data handling, two-deep enforcement, YPT compliance, and the privacy promises (we don't sell data, etc.).

### 12. Atoms & shared (`atoms.jsx`)

Shared primitive components (Pill, Chip, IconButton, etc.) used across artboards. These are conventions to follow, not specific code to copy.

---

## Key interactions & behavior

### Public site routing

- **Default subdomain:** `<troopslug>.compass.app` (e.g. `troop567.compass.app`)
- **BYO domain:** Customer points a CNAME at `troops.compass.app`, we serve their content under their hostname with auto-issued Let's Encrypt cert
- **Detection:** `Host` header on incoming request → look up troop → render their content

### Two-deep messaging enforcement

Any 1:1 message between an adult leader and a youth scout **must** include a second adult on the thread. Enforced server-side:
- When composing, the UI prompts to add a second adult before send
- All messages are logged for parent visibility
- Phone-call logs (proposed feature in roadmap) also require two-deep attestation

### Weekly newsletter draft → send flow

1. **Saturday 6pm:** Compass runs the AI draft job against troop data
2. **Saturday 8pm:** Push notification + email to the designated newsletter editor: "Your draft is ready"
3. **Sunday morning:** Editor opens draft, reviews blocks, can edit/remove/add, hits Approve
4. **Sunday 7am (default):** Digest sends to all configured recipients
5. **Auto-skip:** If editor doesn't approve by Sunday 6am, hold (don't auto-send) and notify

### Custom domain setup wizard

UI flow in admin Settings → Custom domain:
1. Customer enters their domain (e.g. `troop567.org`)
2. UI shows the exact CNAME record to add at their registrar (with copy buttons + screenshots for top 4 registrars: GoDaddy, Namecheap, Google Domains, Porkbun)
3. UI polls DNS every 30s, shows propagation status
4. Once detected, auto-provision Let's Encrypt cert, flip the troop's `custom_domain` column
5. **Optional:** Email-on-domain wizard adds 3 more records (CNAME for DKIM, TXT for SPF, TXT for DMARC) and configures Postmark sending domain

### Feedback board voting

- Authenticated users can upvote (one per request)
- Admins (Compass team) can change status, add update notes
- "Your request" badge if you authored it
- "You voted" badge after upvote
- Sort: Most votes (default), Newest, Status

---

## Open questions / known unknowns

These were intentionally left unresolved during design — flag them for product before building:

1. **AI tier pricing** — per-troop monthly Claude API cost is not yet measured. Need a 30-day usage study with 5 pilot troops to set the price.
2. **Scoutbook API access** — BSA gates this. Application is in. Plan for both states (with API and without).
3. **Council tier features** — top-down rollout to multiple troops in a council; SSO; white-label. Designed at a high level only.
4. **Mobile app shell** — designed as web/PWA in mocks. Decision needed: native (React Native) vs PWA. Mocks work for either.
5. **Cub Scout pack vs. Troop** — current designs assume Troop. Pack adaptations (den structure, different rank progression) are TBD.

---

## Files in this handoff

```
design_handoff_compass/
├── README.md                         (this file)
└── designs/
    ├── Scout Host Designs.html       ← root file; open this in a browser
    ├── tokens.js                     ← palettes + type
    ├── design-canvas.jsx             ← canvas wrapper (NOT production)
    ├── tweaks-panel.jsx              ← in-design tweak controls (NOT production)
    ├── atoms.jsx                     ← shared primitives (conventions)
    │
    │ ── Marketing ──
    ├── marketing-safe.jsx            ← Pine & Brass direction
    ├── marketing-balanced.jsx        ← Slate & Sky direction (LEAD)
    ├── marketing-bold.jsx            ← Evergreen & Spectrum direction
    ├── plans.jsx                     ← pricing page
    ├── positioning.jsx               ← "no commodity markups" page
    ├── security.jsx                  ← security/privacy page
    │
    │ ── Public troop site ──
    ├── troop-pages.jsx               ← home, about, calendar, photos, join
    ├── page-builder.jsx              ← v1 (reference)
    ├── page-builder-v2.jsx           ← v2 (LEAD)
    │
    │ ── Admin app ──
    ├── admin-pages.jsx               ← dashboard, people, comms, settings
    ├── desktop-calendar.jsx          ← admin calendar with RSVPs
    ├── newsletter.jsx                ← AI auto-newsletter (flagship)
    ├── feedback.jsx                  ← in-app roadmap + support
    │
    │ ── Mobile (parent app) ──
    ├── ios-frame.jsx                 ← device bezel
    ├── mobile-app.jsx                ← shell + nav
    ├── mobile-feed.jsx               ← activity feed
    ├── mobile-calendar-v2.jsx        ← calendar + RSVP
    ├── mobile-chat.jsx               ← two-deep messaging
    │
    │ ── Email ──
    ├── email.jsx                     ← HTML email templates
    │
    └── font-comparison.jsx           ← type exploration (NOT production)
```

To view the designs, open `designs/Scout Host Designs.html` in a modern browser. The design-canvas wrapper lets you pan/zoom and click any artboard to focus it fullscreen.

---

## Next steps for the implementing team

1. Read this README end-to-end
2. Open `Scout Host Designs.html` and walk through every section (it's organized top-to-bottom by user journey: marketing → public troop → admin → mobile)
3. Confirm the lead palette (`balanced` / Slate & Sky) and the lead marketing direction (`marketing-balanced.jsx`) with the product owner before starting
4. Set up the codebase scaffold (Next.js + Tailwind + shadcn) and port `tokens.js` → `tailwind.config.js`
5. Build in this order — fastest path to a usable product:
   - **Phase 1:** Marketing site + plans page + positioning page (no auth, static)
   - **Phase 2:** Public troop pages (read-only, multi-tenant, custom domain support)
   - **Phase 3:** Admin app shell + dashboard + people/roster
   - **Phase 4:** Calendar + RSVP + communications
   - **Phase 5:** Auto-newsletter (Claude integration)
   - **Phase 6:** Mobile parent app
   - **Phase 7:** In-app feedback + Scoutbook sync
