# Handoff: Compass — Scout Unit Hosting Platform

## Overview

Compass is a hosting service for volunteer-run Scouting units (Cub Scout packs, Scouts BSA troops, Venturing crews, Sea Scout ships, Explorer posts). It replaces dated platforms like TroopWebHost with a modern, mobile-first, security-engineered alternative covering:

- A **public marketing site** (compass.app) targeted at unit volunteers shopping for hosting
- A **public unit site** (one per unit, on a custom subdomain) — the "front door" families and prospective scouts see
- An **admin dashboard** for committee chairs, scoutmasters/cubmasters, treasurers, and webmasters
- A **parent mobile app** (iOS/Android) for calendar, RSVPs, payments, photos, and chat
- A **team chat** experience modeled on SportsEngine/TeamSnap, with channels per den/patrol and YPT-compliant two-deep leadership

This is **independent software, not affiliated with Scouting America or BSA.** It is designed to integrate with (not replace) Scoutbook for advancement tracking — Compass owns calendar, communication, payments, public web presence, and photos.

## About the Design Files

The files in this bundle are **design references created in HTML/React-via-Babel** — prototypes showing intended look, content, and behavior. They are **not** production code to copy directly. Your task is to **recreate these designs in the target codebase's environment** using its established patterns and libraries.

If no codebase exists yet, recommended stack:
- **Web (marketing, public unit pages, admin):** Next.js 14+ App Router, TypeScript, Tailwind CSS, shadcn/ui
- **Mobile:** React Native + Expo, or native (SwiftUI / Kotlin Compose) if push-notification reliability is a v1 priority
- **Backend:** Postgres, Prisma, server-side auth (NextAuth or Clerk for SSO)
- **Realtime chat:** Pusher or Ably for v1; self-hosted Centrifugo if scale demands

## Fidelity

**High-fidelity.** Pixel-perfect mockups with final colors, typography, spacing, and interaction intent. Recreate UI pixel-perfectly using the codebase's libraries. The Forest & Ember palette and Newsreader / Inter Tight type system are **locked**.

The other palette directions (Pine & Brass, Slate & Sky) and the alternate marketing variants (`marketing-safe.jsx`, `marketing-bold.jsx`) are kept in the source folder for reference only — **do not implement them**.

---

## Locked design system

### Palette — "Forest & Ember" (the `bold` palette in `tokens.js`)

| Token | Hex | Use |
|---|---|---|
| `bg` | `#f4ecdc` | Warm cream page background |
| `surface` | `#ffffff` | Cards, sheets |
| `surfaceAlt` | `#1a1f1a` | Inverted/dark sections |
| `ink` | `#0d130d` | Primary text |
| `inkSoft` | `#2a352a` | Body text |
| `inkMuted` | `#5a6258` | Captions, meta |
| `line` | `#d4c8a8` | Borders |
| `lineSoft` | `#e6dcc0` | Subtle dividers |
| `primary` | `#0e3320` | Deep evergreen — primary brand |
| `primaryHover` | `#06200f` | Hover state |
| `accent` | `#c8e94a` | Chartreuse highlight (use sparingly) |
| `accentSoft` | `#e3f29b` | Tints |
| `danger` | `#a82e1d` | Errors |
| `success` | `#3d6b3a` | Success / YPT-compliance affirmations |

**Secondary spectrum** — used for category coding (event types, stat cards, channel icons):

| Token | Hex | Default category |
|---|---|---|
| `sky` | `#3a7ab8` | Informational, calendar |
| `ember` | `#e07a3c` | Outdoor events, campouts |
| `raspberry` | `#c43d6b` | Urgent alerts |
| `butter` | `#f3c54a` | Finance, money, dues |
| `plum` | `#6e3b7a` | Photos, private/personal |
| `teal` | `#3aa893` | Scoutbook sync, success-y |

### Typography

```
display: "Newsreader", "Source Serif Pro", Georgia, serif
ui:      "Inter Tight", "Inter", system-ui, -apple-system, sans-serif
mono:    "JetBrains Mono", ui-monospace, SFMono-Regular, monospace
```

Newsreader weights used: 400, 500. Italic weights used: 400, 500.
Inter Tight weights used: 400, 500, 600, 700.

**Size scale (web):**

| Use | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|
| Hero display | 116px Newsreader | 400 | 0.92 | -0.035em |
| Section headline | 64px Newsreader | 400 | 1 | -0.025em |
| Subsection | 40px Newsreader | 400 | 1.1 | -0.02em |
| Card title | 24–28px Newsreader | 500 | 1.15 | -0.015em |
| Body (large) | 17px Inter Tight | 400 | 1.55 | 0 |
| Body | 14–15px Inter Tight | 400 | 1.5 | 0 |
| Meta / caption | 11–12px Inter Tight | 500 | 1.4 | 0.04em–0.16em uppercase |

**Italic + accent-fill is the signature treatment:** display headlines often emphasize a phrase via `font-style: italic; color: var(--accent)` or by wrapping in a chartreuse/ember background block. Keep it.

### Spacing & shape

- Border radius: 4 (chips), 6 (buttons), 8 (cards small), 10 (inputs), 12–14 (cards), 16 (sheets), 999 (pills)
- Page padding (web): 56px horizontal, 88px vertical between major sections
- Mobile screen padding: 20px horizontal
- Shadow (subtle): `0 4px 20px rgba(15,23,42,0.08)` — used on floating elements
- Inverted dark bands (`surfaceAlt #1a1f1a`) appear at section transitions for visual rhythm

---

## Routes & screens

### 1. Marketing site (`compass.app`)

**File:** `source/marketing-balanced.jsx` (this is the locked version, despite the filename)

Single-page site. Sections in order:

1. **Top nav** — wordmark left, anchors right (Product / Security / Pricing / Sign in), CTA button (Start free trial)
2. **Hero** — kicker line "The Compass Field Notes / Modern Software for Volunteer Units / Independent · Not affiliated with BSA". Headline: *"Your troop's website shouldn't look like 2008."* (with "look like 2008" in chartreuse accent block). Right column: pill badge "SECURITY-FIRST · BUILT FOR MINORS' DATA", body copy, CTAs.
3. **Photo strip** — three landscape photos, top-bordered in accent / sky / raspberry
4. **Stats / values band** — dark forest background. Four cells: AES-256 encryption · SSO (SAML/OIDC/WebAuthn) · Two-deep YPT-aligned audit · $12 flat per unit
5. **Features (4 editorial blocks)** — alternating image/text layout, numbered 01–04. Each features one of: Calendar, Website, Messages, Memories. Use real product copy from the JSX.
6. **Old vs. New comparison** — dark forest band. Side-by-side browser-window mocks: deliberately ugly "Old hosting platform" (Times-on-grey, table layouts, hit counter, animated GIF) vs. clean Compass screenshot. Caption: "The site your families see is your front door."
7. **Pricing** — 2-column. Highlighted "Unit · $12/mo" tier (one price for any unit type) and "District · Talk to us" tier. Listed features each tier. Footnote: non-profit discount, Stripe pass-through.
8. **Migration band** — list of platforms we migrate from (TroopWebHost, ScoutLander, Scoutbook export, generic Wix/Squarespace, Google Sites, Mailchimp lists)
9. **CTA** — "Set up your troop's home base before next week's meeting." Free 30-day trial, no credit card.
10. **Footer** — wordmark, copyright, "Independent · Not affiliated with Scouting America or BSA"

### 2. Public unit site (per-unit, custom subdomain)

**File:** `source/troop-pages.jsx` (use the `TroopBalanced` export — the dark-forest hero version)

Public-facing front door. Sections in order:

1. **Top bar** — Wordmark + unit name + city/est. + nav links (About / Calendar / Photos / Contact)
2. **Hero** — Dark forest background, large display number watermark in the corner (the troop/pack number rendered as a 400+px italic Newsreader watermark with low opacity). Foreground: "Scouts BSA Troop ___" headline + body description.
3. **About + sponsor card** — drop-cap paragraph about the unit, sidebar with chartered organization, address, council
4. **Upcoming events** — 5-item list with month/day blocks, color-coded by event type
5. **Recent news / announcements**
6. **Photo gallery** — grid of recent campout photos
7. **Footer**

Mockup data is anonymized (`Troop 12, Anytown, USA, St. Mark's Community Church`). Real units provide real data via the admin.

### 3. Admin dashboard

**File:** `source/admin-pages.jsx` (use `AdminBalanced`)

**Layout:** Left sidebar (220px) + main column. Sidebar contains: wordmark, current unit name (e.g. "Troop 12"), nav (Dashboard / Calendar / Roster / Messages / Photos / Forms / Finance / Settings), each with optional badge count.

**Dashboard view:**

1. **Greeting block** — Dark forest card with day-of-week display (Tuesday) + a context-aware deadline subhead ("BWCA closes RSVPs Friday · 14 families haven't replied · Court of Honor in 2 weeks")
2. **Stats cards** — 4-up grid, each color-coded with the secondary spectrum. Tracks: scouts active, upcoming events, pending RSVPs, treasurer balance
3. **Next event card** — large, dominant. Shows name, date, location, RSVP tally (Going/Maybe/Can't with progress bars), pending permission slips count, paid count, "Send reminder" action
4. **Recent activity feed** — color-coded by type (photo upload = teal, calendar = sky, finance = ember, message = plum)
5. **Tasks / nudges** — actionable items the leader needs to do this week

**Other admin views (lighter mocks):**

- **Roster** — table view with patrol/den groupings, advancement status (read-only sync from Scoutbook), parent contact info, YPT status badges
- **Calendar editor** — month grid + event-create flyout
- **Messages** — list of threads + leader oversight panel
- **Photos** — admin moderation grid (approve / blur / remove)
- **Forms** — permission slip designer
- **Finance** — Stripe-style ledger

### 4. Security & Trust page

**File:** `source/security.jsx`

Architect-grade documentation, not marketing fluff. Sections:

1. **Auth & Identity:** SAML 2.0, OIDC (Google/Apple/Microsoft as default IdPs), WebAuthn / passkeys, SCIM provisioning for districts, MFA enforcement options, magic-link fallback for parents who refuse passwords
2. **Authorization model:** ABAC with sample policy snippet (in code block). Roles: youth, parent, leader, key-three, district admin. Resource scopes: unit, patrol/den, event, thread.
3. **Data flow diagram:** edge → app → data tier with TLS, AES-256-at-rest, encrypted backups, regional residency
4. **Two-deep leadership audit:** how messaging works — every adult↔youth or adult↔parent thread auto-CCs a second registered leader, all archived for 7 years
5. **Compliance posture:** SOC 2 Type II in progress, GDPR/CCPA covered, COPPA-conscious (no advertising, no third-party trackers, parents control youth-data export)
6. **Incident response:** 24h SLA on disclosure, audit log export

### 5. Parent mobile app — 8 screens

**File:** `source/mobile-app.jsx`

iPhone (402×874pt) screens:

1. **Home** — greeting + next-up event card with payment warning + recent activity feed
2. **Calendar** — filterable list of events with month/day blocks, color-coded
3. **Event detail** — RSVP per scout (one parent can RSVP for multiple kids), permission slip toggle, payment summary
4. **Payment** — Stripe-style summary, line items per scout, processing fee disclosed, Apple Pay default
5. **Messages** — list of threads, two-deep badges, pinned threads
6. **Thread** — conversation with **green YPT two-deep banner** ("Mr. Avery & Mr. Brooks watching"), auto-CC'd second adult shown as message metadata
7. **Photos** — event-grouped grid, masonry-ish layout
8. **Photo permissions** — per-scout privacy toggles (auto-blur faces, hide from public site, family-only)

Bottom tab bar: Home · Calendar · Chat · Photos · Profile (5 tabs, glass blur effect like iOS 26).

### 6. Team chat — 5 screens

**File:** `source/mobile-chat.jsx`

Replaces the old "Messages" tab with SportsEngine/TeamSnap-style team chat:

1. **Channels list** — grouped by Your channels / Event channels (auto-archive on event end) / Leader-only. Each channel shows last message, member count, unread count, two-deep badge where applicable.
2. **Patrol thread** — conversation in a patrol channel, with persistent **green TWO-DEEP banner** at top (both adult leaders watching, scouts can chat freely). Mix of text, photos, reactions, @mentions. Leader names render in raspberry with role badge (SM/ASM).
3. **Event channel + RSVP** — event channel with embedded event card (Going/Maybe/Can't tally) + drivers ask + inline RSVP confirmation toast + read receipts
4. **Poll** — "What should we cook Friday?" — embedded poll card with horizontal-fill bars, vote counts, deadline. Voted state shown.
5. **Leader oversight** — leader-only view showing channel stats (msgs/30d, flags, scouts active) + moderation tools (keyword alerts, channel log export, mute/remove member, auto-archive on event end). Bottom callout: "Removing either adult auto-suspends the channel."

**Channel auto-creation rules:**
- One channel per den (Cub) or patrol (Scouts) — youth + 2+ leaders
- One channel per pack/troop — all members
- One Parents-only channel — parents + leaders
- One Leader-only channel — registered leaders only
- One channel per published event — auto-archives 24h after event end

**YPT enforcement:**
- Any channel containing youth must have ≥2 registered, YPT-current adult leaders
- Removing one adult below the threshold auto-suspends the channel until restored
- All youth-containing threads logged for 7-year audit retention
- Direct 1:1 between adult and youth is not possible — must include 2nd adult

---

## Components inventory

Components from `atoms.jsx` to recreate in the target framework:

| Component | Purpose | Props |
|---|---|---|
| `SHMark` | Compass-rose icon mark (SVG) | `size`, `color`, `accent` |
| `SHWordmark` | "Compass" wordmark | `p` (palette), `size` |
| `Avatar` | Initials circle | `initials`, `size`, `bg` |
| `Photo` | Placeholder photo (gradient + abstract scene SVG by `subject`) | `subject` ('canoe' \| 'campfire' \| 'troop' \| 'forest' \| 'summit'), `w`, `h`, `p` |
| `Chip` | Small rounded label | `tone`, `children`, `p` |
| `IconBtn` | Square icon-only button | `icon`, `p` |
| `IOSDevice` | iPhone bezel + status bar + home indicator (from `ios-frame.jsx`) | `width`, `height`, `title`, `children` |

Custom components to build per surface:

- `EventCard` (admin + mobile) — date block + title + RSVP tally
- `EventChannelCard` (chat) — embedded event with RSVP buttons inline
- `Poll` (chat) — option list with horizontal-fill bars
- `TwoDeepBanner` — green pill banner with two leader names
- `ChannelRow` (chat list) — icon block + name + meta + unread badge
- `MessageBubble` — left/right variants, leader badges, reactions, photo support
- `StatCard` (admin) — color-top-border + large display number + label
- `ActivityRow` (admin) — color-coded event-type icon + text + timestamp

---

## State / data model (sketch)

```ts
// Identity
User { id, kind: 'youth' | 'parent' | 'leader', name, dob, photoUrl, ... }
ParentLink { parentId, scoutId } // many-to-many
Leader { userId, role: 'SM' | 'ASM' | 'CM' | 'CC' | 'committee' | 'webmaster',
         yptExpiresAt, registeredWith: 'BSA' }

// Org
Unit { id, type: 'pack' | 'troop' | 'crew' | 'ship' | 'post', number, name,
       sponsor, council, district, customSubdomain, theme }
Patrol { id, unitId, name, kind: 'patrol' | 'den', leaderUserId }
Membership { userId, unitId, patrolId?, role, joinedAt }

// Events
Event { id, unitId, name, startsAt, endsAt, location, fee, requiresPermissionSlip,
        capacity, eventType, autoArchiveChannelAt }
RSVP { eventId, scoutId, status: 'going' | 'maybe' | 'no', paid, slipSigned }
Payment { id, rsvpId, stripePaymentIntentId, amount, status }

// Comms
Channel { id, unitId, scope: 'unit' | 'patrol' | 'event' | 'parents' | 'leaders',
          patrolId?, eventId?, archivedAt }
ChannelMember { channelId, userId, role: 'member' | 'moderator',
                muted, addedAutomatically }
Message { id, channelId, authorId, body, attachments, mentionsUserIds[], pinned }
Reaction { messageId, userId, emoji }

// Photos
Album { id, unitId, eventId?, name, coverPhotoId }
Photo { id, albumId, uploaderId, blurredFaces, taggedScoutIds[], visibility }
PhotoPermission { scoutId, allowPublic, allowFamilyOnly, autoBlurFaces }

// Audit / YPT
AuditLogEntry { id, actorId, action, resourceType, resourceId, at, ipHash }
YPTComplianceCheck { channelId, isCompliant, lastCheckedAt }
```

---

## Interactions & behavior

- **Routing:** marketing site at root domain; per-unit site at `<number>.compass.app` or custom domain; admin at `admin.compass.app/<unit>`; mobile app deep-links into events, threads, photos
- **Auth flows:**
  - SSO-first (Google / Apple / Microsoft buttons + "More options" for SAML)
  - WebAuthn passkey enrollment on first login
  - Magic-link fallback for parents (email-based) — never store passwords for parent accounts unless they opt in
  - Youth accounts require parent invite + parental consent flow (COPPA-aware)
- **Two-deep enforcement:** Server-side guard on every channel-write. If `channel.scope === 'patrol' && channel.youthCount > 0 && channel.yptCurrentAdultCount < 2` → suspend channel, notify Key Three.
- **Push notifications:** events RSVPs, mentions, leader announcements, payment-due reminders. Quiet hours configurable per family.
- **Realtime:** chat messages, RSVP tallies, photo uploads — all live-update via WebSocket/Pusher.
- **Animations:** restrained. 200ms ease-out for modal/sheet entrance; 150ms for hover states; spring physics for the tab bar pill indicator on mobile.

---

## Files in this bundle

```
design_handoff_compass/
├── README.md                              ← this file
├── Scout Host Designs.html                ← open this in a browser to view all designs interactively
└── source/
    ├── tokens.js                          ← Forest & Ember palette + type system (use `bold` palette)
    ├── atoms.jsx                          ← shared SHMark, SHWordmark, Avatar, Photo, Chip
    ├── ios-frame.jsx                      ← iPhone bezel
    ├── marketing-balanced.jsx             ← marketing site (locked design)
    ├── troop-pages.jsx                    ← public unit site (use TroopBalanced export)
    ├── admin-pages.jsx                    ← admin dashboard (use AdminBalanced export)
    ├── security.jsx                       ← security & trust page
    ├── mobile-app.jsx                     ← parent mobile app (8 screens)
    ├── mobile-chat.jsx                    ← team chat (5 screens)
    ├── design-canvas.jsx                  ← (canvas wrapper — NOT for production)
    ├── tweaks-panel.jsx                   ← (designer tool — NOT for production)
    └── font-comparison.jsx                ← (designer tool — NOT for production)
```

To view the designs:

```bash
cd design_handoff_compass
python3 -m http.server 8000
# then open http://localhost:8000/Scout%20Host%20Designs.html
```

The HTML file uses in-browser Babel and Google Fonts (Newsreader + Inter Tight). No build needed — just serve the folder.

---

## v1 scope

**In scope:**

- Marketing site (single page)
- Public unit site (one template — the dark-forest hero)
- Admin dashboard (calendar, roster, messages, photos, forms, finance)
- Parent mobile app (8 screens)
- Team chat (5 screens)
- Auth: Google / Apple / Microsoft SSO + WebAuthn + parent magic-link
- Two-deep audit enforcement
- Stripe payments with Connect for treasurer payouts
- Scoutbook one-way export (CSV / iCal)

**Out of scope for v1:**

- Scoutbook deep / bidirectional sync (export only)
- Advancement tracking (defer to Scoutbook entirely)
- Council / district multi-unit dashboard (post-v1 enterprise tier)
- Native voice / video calls in chat
- AI summarization

---

## Brand notes

- **Name on marketing surfaces:** "Compass" (the project file is named "Scout Host" — that's the working title; ship as Compass).
- **Tagline:** "Modern software for volunteer units."
- **Disclaimer required on every public page:** "Independent · Not affiliated with Scouting America or BSA."
- **Voice:** Direct, respectful of volunteers' time, security-conscious. The TroopWebHost-vs-Compass comparison is the antagonist; never punch at any specific real unit or person.
- **No real testimonials, customer logos, or troop names.** All mockup content uses anonymous placeholders (Troop 12, Anytown, USA, fictional adults Mr. Avery / Mr. Brooks / Ms. Carter, fictional kids Sam / Max / Jamie / Alex). Replace with real customer content only after written consent.
