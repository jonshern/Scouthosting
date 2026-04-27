# Scouthosting Roadmap

**Scouthosting is the planning and communication hub for Scout units** —
troops, Cub Scout packs, Venturing crews, Sea Scout ships. Each unit gets a
modern, mobile-first website plus a private member hub: calendar, photos,
forms, group email, trip & meal planning, and a CMS leaders can actually use.

**Scoutbook handles advancement.** We don't compete with it; we deep-link
into it and surface read-only summaries when BSA's API allows. That keeps
leaders out of double-entry and lets us focus on what units complain
about — the operational stuff Scoutbook doesn't cover.

The product replaces TroopWebHost (and Patrol-style Google Sites duct tape)
with one tool that's nice to use on a phone, fast to set up, and deliberately
narrow on advancement.

---

## Legend

Items in this roadmap may be tagged:

- `[security]` — defers a security hardening we'll come back to. Treat the
  collection of `[security]` items as the security backlog.
- `[infra]` — deployment / operational work, not user-facing.
- `[migration]` — work that helps units move off TroopWebHost.

## Security backlog (deferred — `[security]`)

We picked the simplest tenancy model (shared Postgres tables with `orgId`
columns and app-layer enforcement) so we can move fast. These items are the
defense-in-depth we'll come back to before any paid customer onboards real
member data:

- [ ] `[security]` Postgres Row-Level Security (RLS) policies on every
      org-scoped table. App sets `app.org_id` per-request; policies enforce
      `org_id = current_setting('app.org_id')::uuid`. Removes the class of
      "forgot to filter by orgId" bugs entirely.
- [ ] `[security]` Per-tenant encryption keys, envelope-encrypted with a
      KMS-managed root key. Each org gets its own data key; compromise of
      one org's data doesn't compromise others.
- [ ] `[security]` Field-level encryption for sensitive PII (medical forms,
      birthdates, phone numbers) using each org's data key. Search by
      blind-indexed hashes only.
- [ ] `[security]` Encrypted backups with separate per-org export bundles
      (single `pg_dump --table=... --where="org_id=..."`).
- [ ] `[security]` Audit log of every read/write to youth records.
- [ ] `[security]` 2FA for leader/admin roles (mandatory) and parent role
      (optional).
- [ ] `[security]` Rate limiting (login, signup, /api/provision) and bot
      protection on signup.
- [ ] `[security]` CSP, Trusted Types, strict CORS, signed cookies.
- [ ] `[security]` SOC 2 Type 1 audit and independent youth-data review
      (graduated up from Phase 14).
- [ ] `[security]` Penetration test before first paid council customer.

## Phase 0 — Marketing & demo (DONE in this commit)

- [x] Public marketing site (`index.html`) — pitch, features, pricing, FAQ
- [x] Compiled feature inventory from screenshots + TroopWebHost
- [x] Live demo at `/demo/` showing what a provisioned troop site looks like
- [x] **Demo is fictional** ("Sample Troop 100", Anytown USA) — no real unit
- [x] Signup form + login page stubs
- [x] This roadmap

## Phase 1 — Multi-tenant scaffold (DONE)

The core architecture: one server, many troop sites, isolated by subdomain.

- [x] Express server with subdomain-based org routing
- [x] Site template with `{{placeholders}}`
- [x] Provisioning: HTTP `POST /api/provision` and `node server/provision.js`
- [x] Signup form posts to provisioning endpoint, returns new site URL
- [x] Marketing site served on the apex / `www` host
- [x] Demo org pre-seeded for `troop100.localhost`
- [x] Reserved-subdomain list (no `www`, `admin`, `api`, etc.)
- [ ] Per-org theme (logo, color) injected into template

## Phase 2 — Database (DONE in this commit)

- [x] Postgres 16 via docker-compose
- [x] Prisma schema: `Org`, `User`, `Session`, `OrgMembership`, `Member`,
      `Event`, `Photo`, `Form`
- [x] Single shared schema; `orgId` discriminator on every org-scoped table
- [x] App-layer enforcement of org boundaries
- [x] Demo org seeded via `prisma/seed.js`
- [x] Provisioning rewritten to write to Prisma
- [x] Org resolution in the server reads from Prisma
- [ ] `[security]` Row-Level Security policies (see backlog)
- [ ] `[infra]` Daily logical backups; per-org export-to-zip on demand
- [ ] `[migration]` Importer that ingests TroopWebHost CSV/JSON exports

## MVP-2 priority order

Reordered after a focused conversation with the customer voice: the
features Scout units actually touch every week are CMS, photos, calendar,
and member email. Advancement / money / training / OA / equipment slide
behind these.

1. **CMS** — DONE. Per-org `/admin` with page content + announcements.
2. **Photos & albums** — next.
3. **Calendar & events** — Google Calendar add-button + per-event Maps,
   Apple Maps, Waze directions.
4. **Member directory + group email** — send to whole org / patrol /
   subgroup.

## Phase 3 — Identity & auth (IN PROGRESS)

A user account is global. Roles attach via `OrgMembership` (one user, many
orgs). Roles: `scout`, `parent`, `leader`, `admin`. A super-admin role for
Scouthosting staff lives outside this model.

- [x] Lucia auth on the control plane, sessions in `public.Session`
- [x] argon2id password hashing (`@node-rs/argon2`)
- [x] `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- [ ] Email verification on signup
- [ ] Magic-link login (passwordless)
- [ ] Password reset flow
- [ ] `[security]` 2FA for leader/admin roles
- [ ] `[security]` CSRF protection on state-changing routes
- [ ] Two-deep digital communication enforcement
- [ ] Youth Protection guardrails (parent linkage, minor flags)
- [ ] SSO with Google / Apple / Microsoft

## Backlog (added during build)

Captured in-flight; sequenced into the right phase later.

- **RSVP from inside the email.** Event-reminder broadcasts include
  per-recipient Yes / No / Maybe buttons. Each button is an HMAC-signed
  link (`/rsvp/:token?response=yes`) so one click from the inbox records
  the response — no login, no extra steps. Token encodes
  `{eventId, name, email}` with a short expiry; we don't need a token
  table on disk.

- **Activity feed (Facebook-like).** Subsume Announcements and Albums into
  a unified `Post` model with optional photo attachments. Reverse-chronological
  feed on the home page, comments scoped to the org's members. Public posts
  on the public site, members-only posts in the member hub.
- **Optional Facebook cross-post.** Per-org "publish to our Facebook page"
  toggle on a post. OAuth into Meta's Page API; on publish, mirror the
  post text + photos to the unit's Facebook page. Off by default — a unit
  has to connect a page first. Same hook can later cross-post to Instagram.
- **Communication preference per member** (`Member.commPreference`,
  `smsOptIn`). Drives whether a broadcast goes via email, SMS, both, or
  none. SMS provider (Twilio) lands with Phase 8 (email/messaging).
- **Lucia migration / replacement.** Lucia 3 is deprecated; tagged
  `[security]` to revisit when its successor stabilizes.
- **Multer 2 LTS migration** if/when 2.x stabilizes broadly.

## Phase 3.5 — CMS (DONE in this commit)

The first MVP-2 pillar. A leader can log in to `/admin` on their org
subdomain and edit the public site without anyone redeploying.

- [x] `Page` and `Announcement` Prisma models
- [x] Per-org admin shell with sidebar and styled forms
- [x] Auth-gated routes: only `leader` or `admin` membership can access
- [x] Auto-linked admin grant when the founding leader signs up with the
      same email used at provisioning
- [x] Edit hero headline, hero lede, About body, Join body, Contact note
- [x] Publish, edit, delete, pin, expire announcements
- [x] Public site renders DB-stored content over the seeded defaults
- [x] Announcements section with pinned-first ordering
- [ ] Markdown / rich-text editing (currently plain text + `\n\n`)
- [ ] Image insertion in body (waits on Phase 3.6)
- [ ] Multi-page support (custom pages beyond the home page)
- [ ] Audit log of who edited what (`[security]`)

## Phase 4 — Calendar & events

The most-used feature. Match TroopWebHost's coverage, then exceed it.

- [x] Event CRUD (all-day, multi-day, location, cost, capacity, category)
- [x] **One-click Google Calendar add** on every event; also Apple
      Calendar (.ics) and Outlook (deep-link)
- [x] **Subscribable ICS feed** per org at `/calendar.ics` so members
      see every event in their personal calendar automatically
- [x] **Directions for every event** — Google Maps, Apple Maps, Waze
      links built from the event's address
- [x] Public `/events` list + `/events/:id` detail page
- [x] **RSVP** tracking — sign-in required, idempotent on (event, user),
      yes / maybe / no with guest count and notes; counts surfaced on the
      public event page and admin list with CSV export
- [x] Public `/login` + `/signup` on every org subdomain (any user, not
      leader-only); auto-creates `OrgMembership(role=parent)`
- [ ] **RSVP from inside the email** (HMAC-signed Yes/No/Maybe links — no
      login needed for inbox click-through)
- [ ] Recurring events (RRULE)
- [ ] Sign-up sheet **slots** (food, gear, "Bring drinks", "Drive 2 scouts")
- [ ] Capacity enforcement at submit time + waitlist
- [ ] Carpool sign-ups
- [ ] **Two-way Google Calendar sync** (per-user) — additive; the ICS
      feed already covers the read path. This adds writes from inside
      the user's Google Calendar back to Scouthosting.
- [ ] Service-hour, camping-night, hiking-mile auto-tracking from events
- [ ] Event reports (attendance, hours, cost breakdown)

## Phase 4.5 — Trip planning & meal planner

Distinct from generic events: campouts and trips need provisioning logic.

- [ ] **Headcount roll-up** from RSVPs + late adds, by patrol
- [ ] **Meal plan builder** — choose meals per day (breakfast / lunch / dinner /
      snacks), pick from a recipe library or write custom recipes
- [ ] **Recipe scaling** — recipes stored per 1 person, auto-scaled to actual
      headcount (with patrol-level scaling for patrol cooking)
- [ ] **Auto-generated shopping list** aggregated across the whole trip,
      grouped by aisle (produce, dry goods, dairy, meat…), exportable to PDF
      or shareable link a parent can take to the store
- [ ] **Dietary flags per Scout** (vegetarian, gluten-free, allergies) carried
      into the meal plan; warnings if a meal violates a flag
- [ ] **Cost estimate** per meal and per Scout; reconciles to the event fee
- [ ] **Gear / equipment checklist** for the trip with check-out from the
      Quartermaster's catalog (Phase 10)
- [ ] **Driver / carpool plan** with seats available, who-rides-with-whom
- [ ] **Tour plan** auto-fill (BSA Activity Consent forms pre-filled from the
      member roster)
- [ ] Recipe library shared across all tenants (community contributions)

## Phase 5 — Membership

- [x] Member CRUD (admin)
- [x] Patrol + position fields per member
- [x] Per-member communication preference (email / sms / both / none)
- [x] SMS opt-in flag
- [x] CSV-paste bulk import
- [x] Members-only public directory at /members (login + membership gated)
- [ ] Family linkage (parent ↔ scout, parent ↔ multiple scouts)
- [ ] Dynamic subgroups (rules-based, e.g. "Star+ scouts")
- [ ] Position-of-Responsibility tracking with start/end dates
- [ ] Birthdays, join dates, tenure reports
- [ ] Skills & interests per member
- [ ] CSV upload (file) in addition to CSV-paste

## Positioning vs. Scoutbook

**Scoutbook (scoutbook.scouting.org) is the official Scouting America system
for advancement tracking — ranks, merit badges, partials, awards, and the
companion Scouting mobile app for Scouts and parents.** Merit Badge Counselor
data lives in the related Scoutbook Plus product. Both feed Internet
Advancement, the registrar-of-record system used by councils.

Scouthosting **does not** build a parallel advancement tracker. Anything we
re-implement is double-entry for leaders and a losing fight against the
official tool. Instead:

- **Scoutbook is the system of record** for advancement. Scouthosting
  deep-links to it from every Scout profile, the Eagle list, and the
  advancement summary.
- When BSA's API permits, we **read** advancement progress (ranks, MB
  partials, who's close to completing what) and surface summary dashboards.
  CSV import from Scoutbook reports is the fallback.
- We **own the operations layer around** advancement: Eagle project
  workflow, troop's preferred Merit Badge Counselor list, Court of Honor
  ceremony planning, service-hour / camping-night / hiking-mile capture
  from our calendar (which we then push to Scoutbook).

This sharpens our positioning: Scouthosting is the troop's communication
and operations hub. Scoutbook is the advancement source of truth.

## Phase 6 — Scoutbook integration + ceremony tooling

- [ ] Scoutbook deep-links from every Scout profile, the Eagle list, and
      summary dashboards
- [ ] CSV import from Scoutbook's report exports (rank progress, MB
      partials, awards) — fallback before/until BSA's API access lands
- [ ] When permitted: read-only Scoutbook API sync (rank, MB, awards)
- [ ] Read-only summary dashboards: who's close to a rank, MB partials,
      upcoming boards of review — built off the imported/synced data
- [ ] Eagle project workflow (project management, not advancement records):
      mentor assignment, beneficiary contacts, internal review checklist,
      examples library, status (idea / proposal / approved / in progress /
      complete)
- [ ] Troop's preferred Merit Badge Counselor list (local, troop-curated,
      separate from Scoutbook's national directory)
- [ ] Court of Honor planning: ceremony program generator from a recent
      advancement export, sign-up sheet, parent invitations
- [ ] Service-hour / camping-night / hiking-mile capture from Scouthosting's
      calendar, with a one-click "send to Scoutbook" CSV export for the
      advancement chair
- [ ] Push to Internet Advancement via the same CSV path

## Phase 7 — Photos & files

- [ ] S3-backed object storage per tenant
- [ ] Photo gallery: albums, captions, EXIF, faces opt-in
- [ ] Video gallery (link-based)
- [ ] Forms & Documents library (versioned, role-gated)
- [ ] Drag-and-drop upload, mobile capture

## Phase 8 — E-mail / SMS

- [x] Mail provider abstraction (`lib/mail.js`) with console driver
- [x] Group email broadcast: audience selector (everyone / adults / youth /
      patrol), subject + body, audience preview before send
- [x] `commPreference` filtering (only members with email + email/both
      preference receive)
- [x] MailLog history with recipient snapshot, status (sent/partial/failed)
- [x] Send history view at /admin/email/sent
- [ ] Real SMTP / Resend / SES drivers (the seam is in place)
- [ ] DKIM, SPF, DMARC for the org's outbound domain
- [ ] SMS via Twilio respecting `smsOptIn` (the schema and audience
      filtering already handle this; just need the driver)
- [ ] Inbox + per-member email thread view
- [ ] Bounce + complaint webhooks
- [ ] Throttling and abuse protection
- [ ] One-click unsubscribe per recipient

## Phase 9 — Money

- [ ] Scout account ledger (credits, debits, fundraising)
- [ ] Dues schedules + automatic invoicing
- [ ] Event payments via Stripe
- [ ] Treasurer reports (P&L per event, per-Scout balances)
- [ ] Reimbursement requests

## Phase 10 — Operations

- [ ] Equipment/library catalog with check-out
- [ ] Training History per leader (BSA YPT, IOLS, Wood Badge…)
- [ ] OA elections workflow
- [ ] Announcements / news feed
- [ ] Surveys & forums

## Phase 11 — Customization & domains

- [ ] Theme editor (color, banner, logo)
- [ ] Custom domain with auto SSL (LetsEncrypt)
- [ ] Page editor for static pages (About, Join, History)
- [ ] Public site / member hub split

## Phase 12 — Council edition

- [ ] Council/district admin signs up multiple units at once
- [ ] Cross-unit calendar (e.g. camporee, council events)
- [ ] Centralized leader directory
- [ ] Council-level YPT and training compliance reports
- [ ] Bulk invoicing, single billing relationship

## Phase 13 — Open API & integrations

- [ ] Versioned REST API (read+write) with OAuth2
- [ ] Webhooks (event created, advancement recorded, payment received)
- [ ] Native integrations: Scoutbook, Internet Advancement, Google/Apple
      Calendar, Stripe, Mailgun, Slack, Discord
- [ ] Public migration tool: import from TroopWebHost export

## Phase 14 — Trust & compliance

- [ ] SOC 2 Type 1 audit
- [ ] WCAG 2.1 AA accessibility
- [ ] Independent security review of youth data handling
- [ ] Status page + 99.9% uptime SLA on paid plans

---

## Non-goals (deliberately out of scope)

- A general-purpose CMS — Scouthosting is opinionated for Scout units
- A social network — we don't host public youth content beyond what a unit
  chooses to publish
- Replacing official BSA registration — units still register through their
  council; we integrate, we don't replace

---

## Sequencing notes

- Phases 1–3 unblock everything else and should ship in the first 8 weeks.
- Phases 4 (calendar) and 5 (membership) are the biggest day-1 value drivers.
- Phase 6 (Scoutbook integration + ceremony tooling) is small but
  high-trust: getting "no double-entry with Scoutbook" right is what
  earns leader migration off TroopWebHost.
- Phases 7–10 round out feature parity.
- Phases 11–14 are differentiators against TroopWebHost.
