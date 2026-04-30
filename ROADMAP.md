# Compass Roadmap

**Compass is the communication hub for Scout units** — troops, Cub Scout
packs, Venturing crews, Sea Scout ships. The Evite + SignUpGenius +
Mailchimp + 2008-vintage hosting platform every unit currently duct-tapes
together, replaced by one tool. Calendar with RSVPs and payment, sign-up
sheets for potlucks and drivers, group email and SMS, photos with
per-scout privacy controls, public homepage. Built for the way volunteer
units actually run.

**Scoutbook handles advancement, and we don't try to compete with it.**
Scouting America's official tool already tracks ranks, merit badges,
partials, and awards — for free, with one login the families already have.
Anything we re-implement is double-entry for leaders. Compass deep-links to
Scoutbook from every Scout profile and focuses on the stuff Scoutbook
deliberately doesn't cover: the parent group-text, the campout RSVP, the
potluck sign-up, the Sunday-evening cancellation, the weekly newsletter.

The product replaces TroopWebHost (and Patrol-style Google Sites duct tape)
with one tool that's nice to use on a phone, fast to set up, and
deliberately narrow on advancement. *Troops who communicate well, succeed.*

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
- [x] **Bot protection on signup (honeypot)** — `lib/honeypot.js` adds
      a hidden trap field plus an HMAC-signed render-to-submit timestamp.
      Submissions that fill the trap or arrive in under 2 seconds are
      rejected with a generic error (so naive spammers can't tune
      around the signal). Combined with the existing rate limit, this
      kills the bulk of casual signup spam without making real users
      pass a CAPTCHA. CAPTCHA / proof-of-work remains an option for
      higher-traffic deployments.
- [x] **CSP + hardening response headers** — `lib/securityHeaders.js`
      adds Content-Security-Policy (script + style + font + img + connect
      sources locked down to self + the known Google/Resend hosts; frame-
      ancestors 'none'), X-Content-Type-Options, X-Frame-Options,
      Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy,
      Cross-Origin-Resource-Policy, and HSTS in production. CSRF and
      session cookies are already HttpOnly + SameSite=Lax + Secure-in-prod
      via `lib/csrf.js` + Lucia.
- [ ] `[security]` Trusted Types and tightening `script-src` away from
      `'unsafe-inline'` (requires refactoring inline onsubmit handlers).
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
- [x] **Per-org theme** (logo + color) — color pickers and logo upload
      live on `/admin/content`. Logo replaces the unit-number brand
      mark in the public site header. PNG / JPG / SVG / WebP. Old logo
      is removed from storage on upload of a new one. Audit-logged.

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
- [x] **Per-org export-on-demand** — `/admin/export` UI links to a
      `/admin/export.json` route that streams a single JSON document
      containing every org-scoped row (~37 tables). Audit-logged.
      Zipping uploaded files alongside the JSON is a follow-up; daily
      logical backups remain on the infra backlog.
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
Compass staff lives outside this model.

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

- ~~**Confirm product name & apex domain** before deploy.~~ DONE — name
  is **Compass** and the default `APEX_DOMAIN` is `compass.app`. Cookie
  names, the iCal UID host (RFC 5545 stability), the export-bundle schema
  version, and several GCP resource names are intentionally still on the
  legacy `scouthosting` prefix; flipping any of those signs users out,
  duplicates calendar subscribers' events, breaks downstream importers,
  or requires a coordinated cloud-side migration. They get a coordinated
  rotation in a later pass.

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
- [x] **Audit log of who edited what** — `AuditLog` model captures
      (orgId, userId?, userDisplay snapshot, entityType, entityId,
      action, summary). Wired into the high-traffic CMS / member write
      paths (Page edits, Announcements create/update/delete, Member
      create/update/delete). Viewable at `/admin/audit` filtered by
      entity type. Tamper-evident chaining and youth-record read
      logging stay on the security backlog.

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
- [x] **Carpool sign-ups** — generic "Drivers" slot template still
      available for self-service "I can drive"; the dedicated rides +
      riders plan is in Phase 4.5.
- [ ] **Two-way Google Calendar sync** (per-user) — additive; the ICS
      feed already covers the read path. This adds writes from inside
      the user's Google Calendar back to Compass.
- [x] **Service-hour / camping-night / hiking-mile auto-tracking** —
      `Event.serviceHours`, `Event.campingNights`, `Event.hikingMiles`
      are per-attendee credits. `lib/credits.js#tallyCredits` sums them
      across each member's yes-RSVPs (past events only). Surfaces in
      `/admin/credits` with a per-member roster + unit-total summary,
      plus a `/admin/credits.csv` export to hand to the advancement chair.
- [x] **Event reports** (attendance, hours, cost breakdown) —
      `/admin/events/:id/report` aggregates RSVP counts (yes/maybe/no
      + guest tally), sign-up slot coverage (filled/open/waiting),
      credits-granted (service hr / camping nt / miles × yes-RSVPs),
      and total attendee cost. Linked from each event's row.

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
- [x] **Cross-link gear checklist to the Quartermaster catalog** —
      `GearItem.equipmentId` references the permanent `Equipment` row.
      The trip-plan gear-add form has a dropdown of catalog items; the
      gear table renders linked items as click-through links to the
      catalog entry, with a "catalog" tag.
- [x] **Driver / carpool plan** with seats and who-rides-with-whom —
      `CarRide` (driver, vehicle, seats, departure plan) and
      `CarRideRider` (member or free-form name). Per-event UI at
      `/admin/events/:id/rides` with over-capacity warning.
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
- [x] **Dynamic subgroups** — `Subgroup` model is a saved audience
      query. Rules: AND across set fields, OR within a list. Filters
      on `isYouth`, `patrols`, `skills`, `interests`, and currently-held
      `trainings`. CRUD at `/admin/subgroups`; the email broadcast
      audience selector picks them up under "Saved subgroups".
      Rank-based subgroups ("Star+ scouts") wait on Scoutbook integration.
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

## Positioning — communication, not advancement

The thesis: **troops who communicate well, succeed.** Compass is the
communication and operations hub a volunteer-run Scout unit needs in 2026
— the parent group-text replacement, the campout RSVP, the potluck sign-up,
the Sunday-evening cancellation, the weekly newsletter, the public
homepage. The Evite + SignUpGenius + Mailchimp + 2008-vintage hosting
platform, replaced by one tool that's actually built for the way these
units run.

**Scoutbook (scoutbook.scouting.org) is the official Scouting America
system for advancement tracking — ranks, merit badges, partials, awards.**
It works. It's free for chartered units. There's no reason to compete with
it. Anything we re-implement is double-entry for leaders and a losing
fight against the official tool.

So Compass:

- **Defers to Scoutbook** for the advancement-of-record. Every Scout
  profile in Compass deep-links to that Scout's Scoutbook page so a
  parent or leader is one click from the source of truth.
- **Does not** build a parallel rank / merit-badge tracker. Period.
- **Focuses on what Scoutbook deliberately doesn't cover** — the
  operational + communication layer that makes a unit run. Calendar
  with RSVP / payment / carpools, sign-up sheets for potlucks and
  drivers, group email + SMS, photos with per-scout privacy controls,
  the public homepage families see when they Google "Scouts BSA Anytown".
- **Treats advancement-adjacent tooling as Scoutbook flow-improvers,
  not replacements** — service-hour capture from our calendar that
  pushes to Scoutbook (CSV today, API later when BSA permits) is fine;
  a parallel rank dashboard is not.

The marketing site's "What we don't do" band makes this explicit so a
committee chair shopping around in five minutes never confuses Compass
for an advancement product.

### What this means for the roadmap

Several Phase 5 / Phase 6 modules drift toward Scoutbook-replacement
territory and are flagged for review:

- **Eagle list + project workflow.** Mostly OK — the public Eagle list
  is real public-facing content (it's literally on most troop sites);
  the project workflow is operational glue. But "advancement summary
  dashboards" on the same model would cross the line.
- **Merit Badge Counselor list.** On probation. Scoutbook Plus has the
  national directory; ours is the *troop's preferred* list, which is
  mildly useful, but not core comms.
- **Position-of-Responsibility tracking.** On probation — Scoutbook
  records this for advancement credit. Our tenure history is the only
  reason this lives here separately, and that's thin.
- **Training history per leader.** On probation — same Scoutbook overlap.
  YPT-expired flagging on a campout roster is the only piece that's
  uniquely operational.
- **OA elections workflow.** On probation — lodge handles this; we
  duplicated it. Real OA-compliant elections live in the lodge tooling.

These aren't deleted yet, but they don't get new features. Anything new
we build goes through the comms / operations filter first.

## Phase 6 — Scoutbook integration + ceremony tooling

- [x] Scoutbook user-id field on `Member` (deep-links from the directory
      to that Scout's Scoutbook record)
- [x] **Deep-links from the Eagle list** — when an Eagle row is linked
      to a roster Member with a `scoutbookUserId`, the public `/eagles`
      list and the admin Eagle list render a "Scoutbook ↗" link
      pointing at the per-Scout profile path. Deep-links from broader
      summary dashboards still wait on read-only Scoutbook sync.
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
- [x] **Troop's preferred Merit Badge Counselor list** —
      `MeritBadgeCounselor` model (name, email, phone, badges[],
      optional roster member link, notes). Admin CRUD at `/admin/mbc`;
      members see the list at `/mbc` (login + membership gated since
      it's contact info).
- [x] **Court of Honor planning** — `CohAward` rows attach to a CoH
      event and drive the printable program.
- [x] **Service-hour / camping-night / hiking-mile capture** from
      Compass's calendar with a one-click "send to Scoutbook" CSV
      export at `/admin/credits.csv`. Pushing directly to Internet
      Advancement is the still-open follow-up.
- [ ] Push to Internet Advancement via the same CSV path

## Phase 7 — Photos & files

- [ ] S3-backed object storage per tenant (storage abstraction in
      `lib/storage.js` is wired; cloud driver is the open piece)
- [x] Photo gallery: albums + captions; multi-photo grid in posts
- [ ] EXIF, faces opt-in
- [x] **Video gallery (link-based)** — `Video` model with title, URL,
      visibility (public/members), recordedAt, notes. Admin CRUD at
      `/admin/videos`; gallery at `/videos` embeds YouTube /
      youtu.be / shorts and Vimeo via `lib/videoEmbed.js` (uses
      youtube-nocookie). External / unsupported hosts fall back to a
      "watch on the original site" link. CSP `frame-src` is scoped to
      the two allowed providers.
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
- [x] **Newsletters** — recurring digest the unit emails its families,
      distinct from one-off broadcasts. The leader writes a short intro,
      then auto-includes recent posts (default 14d lookback) + upcoming
      events (default 30d lookahead); each issue snapshots its included
      ids so the archived issue stays accurate. Admin CRUD at
      `/admin/newsletters` with composer / preview / send. Public
      members-only archive at `/newsletters` with public-or-members
      visibility per issue. Send goes through the same `sendBatch` /
      `MailLog` infrastructure as broadcasts so unsubscribe + history
      surfaces work unchanged. (`lib/newsletter.js` — composeNewsletter
      + renderNewsletterHtml, both pure-functional with injectable
      Prisma so 16 unit tests cover them without touching a DB.)
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
- [x] **Treasurer report (per-event P&L)** — `/admin/treasurer` lists
      every event with income (cost × yes-RSVPs), expenses (sum of
      paid reimbursements assigned to that event), and the net.
      Unattributed paid reimbursements appear as a single
      "unattributed expenses" row. Per-Scout balances still wait on
      the Scout-account ledger.
- [x] **Reimbursement requests** — `Reimbursement` model with status
      lifecycle (pending → approved → paid, or → denied). Members
      submit at `/reimburse` with optional receipt upload (image/PDF,
      gated to requester + leaders). Treasurer view at
      `/admin/reimbursements` with filter tabs and total-by-status
      stats. Audit-logged on every decision.

## Phase 10 — Operations

- [x] **Equipment / Quartermaster catalog** — `Equipment` model with
      condition, location, notes; admin CRUD. (Inventory tracking
      itself is on probation per the comms-focus pivot — a unit's
      equipment list is the *least* communication-shaped feature in
      the catalog. Keeping it for now since it's small and inert; can
      be removed later if it doesn't earn its keep.)
- ~~Equipment check-out workflow~~ — **removed.** Loans / borrower
  tracking / return reminders are not communication-shaped enough to
  belong here. Real units will use a shared spreadsheet or pen-and-
  paper for this, and we'd rather build the things that improve how
  they actually talk to each other.
- [x] **Training History per leader** — `Training` model with course
      name, completedAt, optional expiresAt. Member edit page shows the
      list and a course-name datalist auto-completing common BSA
      courses. Org-wide `/admin/training` roster groups every adult
      leader's training and flags expired or expiring-in-60-days
      certifications (YPT in particular).
- [x] **OA elections workflow** — `OaElection` (date, lodge name +
      number, OA team contact, voting members count + threshold,
      status: planned/conducted/submitted) and `OaCandidate` (member
      link or free-form name, status: eligible/elected/not-elected/
      declined, optional vote tally). Admin CRUD at `/admin/oa` with
      per-election candidate-slate management. Audit-logged.
- [x] Announcements / news feed (`Announcement` + Posts)
- [x] **Surveys** — composer, public form, responses, CSV export
      (shipped in #3).
- [ ] Forums

## Phase 10.5 — Group chat (in progress)

The capstone comms feature. Channel-based threaded chat with strict
YPT (Youth Protection Training) enforcement: any channel containing
youth must have ≥2 YPT-current adult leaders, or it auto-suspends to
read-only until the threshold is restored.

- [x] **Schema + YPT primitives** — `Channel` (kind: patrol / troop /
      parents / leaders / event / custom), `ChannelMember` (auto- vs.
      manually-managed flag), `Message` (soft-delete for 7-year audit
      retention), `Reaction`. `ApiToken` for the mobile app's bearer-
      token auth. `OrgMembership.yptCurrentUntil`. Migration
      `20260430150000_chat_and_tokens`.
- [x] **`lib/chat.js`** — pure-functional with injectable Prisma so the
      tests cover every YPT branch without a DB:
      `checkChannelTwoDeep`, `assertChannelTwoDeep` (auto-suspends),
      `suspendChannel` / `unsuspendChannel`, `ensureChannel`,
      `reconcileChannelMembers` (preserves manual moderator overrides),
      `provisionStandingChannels`, `provisionEventChannel`,
      `archiveEndedEventChannels`. **27 unit tests.**
- [x] **`lib/apiToken.js`** — sha256-hashed at rest; raw shown on
      issue exactly once. `Bearer compass_pat_<hex>` accepted. **13
      unit tests.**
- [x] **JSON API** at `/api/v1/`:
        POST   /auth/token            — exchange Lucia session → bearer
        DELETE /auth/token/:id        — revoke
        GET    /auth/me               — sanity check
        GET    /channels?orgId=       — list visible channels
        GET    /channels/:id          — channel + last 50 messages
        GET    /channels/:id/messages?before=<msgId> — paginate older
        POST   /channels/:id/messages — send (passes through YPT guard)
      Auth middleware accepts Lucia session OR bearer token; mobile
      app uses bearer, web fallback uses session.
- [x] **Web admin oversight + parent web fallback** —
      `/admin/channels` lists every channel grouped by kind with
      member/message/last-active counts; per-channel detail page shows
      member roster + recent messages + per-channel YPT compliance
      summary + suspend / unsuspend / archive controls. Unsuspend
      refuses to lift the suspension if YPT still doesn't pass.
      `/admin/ypt` lets leaders set `yptCurrentUntil` per
      OrgMembership; saving re-runs the YPT guard on every channel that
      user belongs to so suspension state catches up immediately.
      `/chat` parent web client is a thin JS module over `/api/v1`
      (5-second polling for v1 — SSE drops it to sub-second in PR D).
      Tenant-site primary nav gets a "Chat" link. Standing channels
      (troop / parents / leaders / per-patrol) provisioned via a one-
      click admin action — idempotent, safe to re-run.
- [x] **Mobile app — first wiring.** The Expo + RN + TS scaffold from
      #32 now talks to the live JSON API. Auth flow: user types their
      unit's subdomain on `SignInScreen`, app opens
      `https://<slug>.compass.app/auth/mobile/begin?redirect=compass://auth/callback`
      in `expo-web-browser`'s auth session, web signs them in, server
      mints an `ApiToken` and deep-links back; the app stores the bearer
      in `expo-secure-store`. ChannelsListScreen pulls real channels +
      groups by kind; ThreadScreen renders messages + composer + 5s
      polling + suspended-channel banner from server-reported state.
      `mobile/src/api/{config,client,channels,auth,storage,types}.ts`
      cover the network surface with 17 unit tests. Other screens
      (Home, Calendar, Photos, Profile) stay mock until those features
      have a backend. Push notifications + TestFlight pipeline are PR
      C2 / C3.
- [x] **Real-time delivery (web).** New `lib/realtime.js` is an
      in-process EventEmitter pub/sub keyed by `channelId`. Server
      routes that mutate channel state — `POST /messages`,
      `suspendChannel`, `unsuspendChannel` — publish events; the new
      `GET /api/v1/channels/:id/stream` endpoint registers an SSE
      subscriber so every connected client gets sub-second fan-out.
      EventSource auths via Lucia cookie OR `?access_token=` (since
      EventSource can't set headers); 25-second SSE comment heartbeats
      keep proxies from closing the connection. The web `/chat` client
      switched from 5-second polling to EventSource + auto-reconnect;
      a fallback path keeps polling every 10 seconds if the browser
      refuses EventSource. 12 new tests on the pub/sub. **PR D2** wires
      the same stream into the mobile client (needs `react-native-sse`
      + an Expo prebuild). **PR D3** layers on Postgres `LISTEN/NOTIFY`
      for multi-instance deployments — single instance is sub-second
      already.
- [x] **Reactions + polls.** Tap any message bucket to toggle a 👍 / ❤️ / 🔥 / etc.; the existing `Reaction` model (composite PK `messageId+userId+emoji`) does the de-dup in the DB. Polls are a `Message.attachmentJson` shape: `{ kind: "poll", question, options[], closesAt, allowMulti }` — leaders compose them via the chat composer's "📊 Poll" button. **Privacy default**: the serialized poll exposes `{ count, youVoted }` per option, NOT the raw voter userId list — peer-pressure dynamics shouldn't leak out of the channel. New endpoints `POST /api/v1/messages/:id/reactions` and `POST /api/v1/messages/:id/poll/vote` (idempotent toggles); both fan out the updated message DTO over the SSE channel so every connected client patches in place. Web `/chat` and mobile `ThreadScreen` both render reactions + polls. 24 new tests (170 server total).
- [x] **Event RSVP embeds.** New `kind: "rsvp"` attachment lets a chat composer drop an event card inline; channel members tap **Going / Maybe / Can't** without leaving the thread. The attachment payload stores just the eventId; an `enrichRsvpAttachments()` pass on every read patches in live event meta + tally counts + the viewer's current response in a single round-trip (groupBy + parallel findMany over the page of message ids). Reuses the existing `Rsvp` table + `eventId_userId` unique key, so chat-driven RSVPs and event-page RSVPs are the same row. Endpoints `POST /api/v1/messages/:id/rsvp` (toggle) + `GET /api/v1/orgs/:orgId/upcoming-events` (composer picker). Web `/chat` and mobile `ThreadScreen` both render the card. 4 new tests (173 server total).
- [ ] Photo attachments. **PR F.**
- [ ] Push notifications + TestFlight pipeline. **PR C2 / C3.**
- [ ] Mobile SSE consumption (react-native-sse). **PR D2.**
- [ ] Postgres `LISTEN/NOTIFY` cross-process bridge. **PR D3.**

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

- A general-purpose CMS — Compass is opinionated for Scout units
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
