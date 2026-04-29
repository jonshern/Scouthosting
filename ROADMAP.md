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
- [x] **Rate limiting** on login, signup, and /api/provision
      (`lib/rateLimit.js`). Fixed-window in-memory counter per (route, IP);
      login = 10/15min, signup = 5/hr, provision = 5/hr. Returns HTTP 429
      with `Retry-After` when the bucket fills. Trust-proxy = 1 so the
      real client IP is used. Multi-instance deployments will need a
      shared store — still on the security backlog.
- [ ] `[security]` Bot protection on signup (CAPTCHA / proof-of-work).
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
- [x] **Email verification on signup** — signed token, 7-day TTL,
      `/verify/:token` flips `User.emailVerified`. Magic-link sign-in
      also auto-verifies.
- [x] **Magic-link login** (passwordless) — `/magic` form emails a
      15-minute token; `/magic/:token` signs the user in.
- [x] **Password reset flow** — `/forgot` → emailed signed token bound
      to the current password-hash suffix; `/reset/:token` accepts a
      new password and invalidates existing sessions. Old reset tokens
      stop working as soon as the password changes.
- [x] **CSRF protection** on state-changing routes (`lib/csrf.js`) —
      cookie + form-field double-submit pattern.
- [ ] `[security]` 2FA for leader/admin roles
- [ ] Two-deep digital communication enforcement
- [ ] Youth Protection guardrails (parent linkage, minor flags)
- [x] **SSO with Google** (`/auth/google/start`, Arctic + OpenID
      Connect, `OAuthAccount` table). Apple / Microsoft still open.

## Backlog (added during build)

Captured in-flight; sequenced into the right phase later.

- **Confirm product name & apex domain** before deploy. "Scouthosting" /
  `scouthosting.com` is a placeholder used throughout marketing copy,
  the ROADMAP, and the demo subdomain. The code uses `APEX_DOMAIN` as
  an env var so renaming is cheap — find/replace marketing copy + flip
  the env var. Decide before registering DNS so the value lands once.

- ~~RSVP from inside the email.~~ DONE (admin Send-RSVP-reminder action,
  HMAC-signed `/rsvp/:token` endpoint).

- ~~Activity feed (Facebook-like).~~ DONE — Post + PostPhoto with
  Facebook-style multi-photo grid (1/2/3/4-up), pin, public-vs-members
  visibility, /posts archive + /posts/:id permalink. Existing Announcements
  + Albums kept around so older content keeps rendering.
- ~~**Comments on posts** (members-only).~~ DONE — `Comment` model
  attached to Post, members-only thread on the post detail page.
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
- [x] **Markdown rendering** — small dependency-free renderer in
      `lib/markdown.js` (headings, bold/italic, links with safe-URL
      whitelist, lists, code, blockquotes). Applied uniformly to Page,
      Announcement, Post, CustomPage, Event description, and Comment
      bodies. Plain-text content renders identically (markdown is a
      superset). Editor surfaces a `Markdown supported` hint.
- [ ] Image insertion in body (waits on Phase 3.6)
- [x] Multi-page support — `CustomPage` model + admin editor; arbitrary
      slugs render at `/p/:slug`.
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
- [x] **RSVP** tracking — yes / maybe / no with guest count and notes;
      counts surfaced on the public event page and admin list with CSV
      export. Idempotent on (event, user) for signed-in users and on
      (event, email) for anonymous form submissions.
- [x] **RSVP without signing in** — anonymous form on the event page
      (name + email) and one-click HMAC-signed `/rsvp/:token` links so
      members can respond directly from the inbox.
- [x] **Send-RSVP-reminder admin action** that emails per-member
      personalized Yes / Maybe / Can't-make-it links for an event.
- [x] Public `/login` + `/signup` on every org subdomain (any user, not
      leader-only); auto-creates `OrgMembership(role=parent)`
- [x] Recurring events (RRULE) — Weekly / Bi-weekly / Monthly presets +
      custom RRULE; expansion via the `rrule` library; `recurrenceUntil`
      caps the series.
- [x] **Sign-up sheet slots** (food, gear, "Bring drinks", "Drive 2 scouts").
      Per-slot capacity enforced inside a transaction so concurrent claims
      can't oversubscribe. Anyone can claim — login optional. Idempotent
      per (slot, user) for signed-in and (slot, email) for anonymous.
- [x] **Waitlist when a slot fills** — overflow sign-ups are queued
      (per-slot opt-out via `allowWaitlist`); on release, the oldest
      waitlister auto-promotes to active inside the same transaction.
- [ ] Carpool sign-ups (currently handled via the generic "Drivers /
      carpool" slot template; dedicated seats-and-riders model still
      open)
- [ ] **Two-way Google Calendar sync** (per-user) — additive; the ICS
      feed already covers the read path. This adds writes from inside
      the user's Google Calendar back to Scouthosting.
- [x] **Service-hour / camping-night / hiking-mile auto-tracking** —
      `Event.serviceHours`, `Event.campingNights`, `Event.hikingMiles`
      are per-attendee credits. `lib/credits.js#tallyCredits` sums them
      across each member's yes-RSVPs (past events only). Surfaces in
      `/admin/credits` with a per-member roster + unit-total summary,
      plus a `/admin/credits.csv` export to hand to the advancement chair.
- [ ] Event reports (attendance, hours, cost breakdown)

## Phase 4.5 — Trip planning & meal planner

Distinct from generic events: campouts and trips need provisioning logic.

- [x] **Headcount roll-up** from RSVPs ("yes" count) with leader override
- [x] **Meal plan builder** — meals per event, recipe name, sortable
- [x] **Recipe scaling** — ingredients stored as `quantityPerPerson`,
      auto-scaled to the live headcount on every render
- [x] **Auto shopping list** aggregated across the whole trip, summed by
      `(name, unit)` across meals, grouped by category (Produce / Meat /
      Dairy / Pantry / Drinks / Frozen / Bakery / Other), printable from
      the public view
- [x] **Dietary flags surface** — `Member.dietaryFlags` listed on the
      plan page so cooks see allergy/diet constraints
- [x] **Recipe-level dietary tags** + automatic warnings — `Meal.dietaryTags`
      ("contains meat / dairy / gluten / nuts / shellfish / egg / soy /
      pork / fish / alcohol") cross-checked against each
      `Member.dietaryFlags`; conflicts surface on both the admin planner
      and the public/members trip plan view.
- [x] **Cost estimate** per meal and per Scout — `Ingredient.unitCost`
      sums `quantityPerPerson * unitCost` across the plan and shows
      cost-per-Scout + total trip cost on the planner.
- [x] **Gear / equipment checklist** for the trip — `GearItem` per
      trip plan with claim/owner; permanent `Equipment` catalog landed
      separately as the Quartermaster module.
- [ ] Cross-link gear checklist to the Quartermaster catalog (current
      gear list is free-text, not yet pulled from `Equipment`).
- [ ] **Driver / carpool plan** with seats available, who-rides-with-whom
      (or fold into the SignupSlot model)
- [ ] **Tour plan** auto-fill (BSA Activity Consent forms pre-filled from
      the member roster)
- [ ] **Recipe library** shared across all tenants (community contributions)

## Phase 5 — Membership

- [x] Member CRUD (admin)
- [x] Patrol + position fields per member
- [x] Per-member communication preference (email / sms / both / none)
- [x] SMS opt-in flag
- [x] CSV-paste bulk import
- [x] Members-only public directory at /members (login + membership gated)
- [x] Family linkage (parent ↔ scout, parent ↔ multiple scouts) —
      `Member.parentIds[]` array of Member ids; admin UI lets you
      attach guardians to a youth.
- [ ] Dynamic subgroups (rules-based, e.g. "Star+ scouts")
- [x] **Position-of-Responsibility tracking** with start/end dates —
      `PositionTerm` model with `(memberId, position, startedAt, endedAt)`.
      Editing `Member.position` auto-closes the open term and opens a
      new one (`lib/positionTerms.js`). Backfill UI on the member edit
      page; org-wide /admin/positions roster shows current PoR holders
      and their tenure.
- [x] **Birthdays, join dates, tenure reports** — birthdate + joinedAt
      now editable on the member form. New `/admin/reports` page surfaces
      upcoming birthdays (next 60 days, ignoring birth year, "today!"
      callout), longest-tenure leaderboard, and roster demographics
      (youth/adult split, active PoR count, contactable count, dietary
      flag count).
- [x] **Skills & interests per member** — `Member.skills[]` and
      `Member.interests[]` arrays editable as comma-separated free-form
      text. Lower-case dedupe; first-seen casing preserved for display.
      Surfaced in CSV import too (`skills`, `interests` columns,
      semicolon- or pipe-separated).
- [x] **CSV upload (file)** — `/admin/members/import` now accepts a
      file upload alongside the existing paste field. memoryStorage
      (2 MB cap) so the temp-file dance is skipped.

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

- [x] Scoutbook user-id field on `Member` (deep-links from the directory
      to that Scout's Scoutbook record)
- [ ] Deep-links from the Eagle list and summary dashboards
- [ ] CSV import from Scoutbook's report exports (rank progress, MB
      partials, awards) — fallback before/until BSA's API access lands
- [ ] When permitted: read-only Scoutbook API sync (rank, MB, awards)
- [ ] Read-only summary dashboards: who's close to a rank, MB partials,
      upcoming boards of review — built off the imported/synced data
- [x] **Eagle project workflow** (project management, not advancement
      records): `EagleProject` with mentor, beneficiary, status
      (`idea` / `proposal` / `approved` / `in progress` / `complete`),
      workbook URL, started/completed dates. Public Eagle list backed
      by `EagleScout`.
- [ ] Troop's preferred Merit Badge Counselor list (local, troop-curated,
      separate from Scoutbook's national directory)
- [x] **Court of Honor planning** — `CohAward` rows attach to a CoH
      event and drive the printable program.
- [x] **Service-hour / camping-night / hiking-mile capture** from
      Scouthosting's calendar with a one-click "send to Scoutbook" CSV
      export at `/admin/credits.csv`. Pushing directly to Internet
      Advancement is the still-open follow-up.
- [ ] Push to Internet Advancement via the same CSV path

## Phase 7 — Photos & files

- [ ] S3-backed object storage per tenant (storage abstraction in
      `lib/storage.js` is wired; cloud driver is the open piece)
- [x] Photo gallery: albums + captions; multi-photo grid in posts
- [ ] EXIF, faces opt-in
- [ ] Video gallery (link-based)
- [x] Forms & Documents library — `Form` model with file uploads
- [ ] Versioning + role-gated access for the documents library
- [ ] Drag-and-drop upload, mobile capture

## Phase 8 — E-mail / SMS

- [x] Mail provider abstraction (`lib/mail.js`) with console driver
- [x] Group email broadcast: audience selector (everyone / adults / youth /
      patrol), subject + body, audience preview before send
- [x] `commPreference` filtering (only members with email + email/both
      preference receive)
- [x] MailLog history with recipient snapshot, status (sent/partial/failed)
- [x] Send history view at /admin/email/sent
- [x] **Real mail drivers** — Resend (HTTP) and SMTP (Nodemailer); both
      fall back to console with a clear warning if env vars missing
- [ ] AWS SES driver
- [ ] DKIM, SPF, DMARC for the org's outbound domain
- [ ] SMS via Twilio respecting `smsOptIn` (the schema and audience
      filtering already handle this; just need the driver)
- [ ] Inbox + per-member email thread view
- [ ] Bounce + complaint webhooks
- [ ] Throttling and abuse protection
- [x] **One-click unsubscribe per recipient** — every broadcast email
      carries a per-member signed `unsubscribe` link in the footer + the
      `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
      headers (RFC 8058). `POST /unsubscribe/:token` flips
      `Member.emailUnsubscribed`; `GET ?one_click=1` does the same for the
      mail-client one-click path. `audienceFor` filters unsubscribed
      members out of the email channel. Re-subscribe link on the same page.

## Phase 9 — Money

- [ ] Scout account ledger (credits, debits, fundraising)
- [ ] Dues schedules + automatic invoicing
- [ ] Event payments via Stripe
- [ ] Treasurer reports (P&L per event, per-Scout balances)
- [ ] Reimbursement requests

## Phase 10 — Operations

- [x] **Equipment / Quartermaster catalog** — `Equipment` model with
      condition, location, current holder, notes; admin CRUD.
- [x] **Equipment check-out workflow** — `EquipmentLoan` model with
      open / returned states, optional `dueAt`. Equipment list shows an
      "out" badge per item; the edit page exposes loan history,
      check-out form (Member dropdown or free-form name), and
      mark-returned action. New `/admin/equipment/loans` roster lists
      every open loan with overdue flagging.
- [ ] Return-reminder emails on overdue loans
- [x] **Training History per leader** — `Training` model with course
      name, completedAt, optional expiresAt. Member edit page shows the
      list and a course-name datalist auto-completing common BSA
      courses. Org-wide `/admin/training` roster groups every adult
      leader's training and flags expired or expiring-in-60-days
      certifications (YPT in particular).
- [ ] OA elections workflow
- [x] Announcements / news feed (`Announcement` + Posts)
- [x] **Surveys** — composer, public form, responses, CSV export
      (shipped in #3).
- [ ] Forums

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
