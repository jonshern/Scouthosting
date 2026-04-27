# Scouthosting Roadmap

A phased plan for building a direct competitor to TroopWebHost — a multi-tenant
website platform for Scouts BSA troops, Cub Scout packs, and Venturing crews.

The goal is **feature parity with TroopWebHost** plus modern UX, mobile-first
design, an open API, and a clean migration path off TroopWebHost.

---

## Phase 0 — Marketing & demo (DONE in this commit)

- [x] Public marketing site (`index.html`) — pitch, features, pricing, FAQ
- [x] Compiled feature inventory from screenshots + TroopWebHost
- [x] Live demo at `/demo/` showing what a provisioned troop site looks like
- [x] **Demo is fictional** ("Sample Troop 100", Anytown USA) — no real unit
- [x] Signup form + login page stubs
- [x] This roadmap

## Phase 1 — Multi-tenant scaffold (IN PROGRESS)

The core architecture: one server, many troop sites, isolated by subdomain.

- [x] Express server with subdomain-based tenant routing
- [x] JSON tenant store (`server/tenants.json`)
- [x] Site template with `{{placeholders}}`
- [x] Provisioning: HTTP `POST /api/provision` and `node server/provision.js`
- [x] Signup form posts to provisioning endpoint, returns new site URL
- [x] Marketing site served on the apex / `www` host
- [x] Demo tenant pre-seeded for `troop100.localhost`
- [ ] Per-tenant theme (logo, color) injected into template
- [ ] Reserved-subdomain list (no `www`, `admin`, `api`, etc.)

## Phase 2 — Identity & auth

Per-tenant accounts. A user account belongs to one tenant. Roles:
`scout`, `parent`, `leader`, `admin`, `super` (Scouthosting staff).

- [ ] Sign-up email verification per tenant
- [ ] Sessions / JWT, secure cookies, CSRF
- [ ] Password reset
- [ ] Two-deep digital communication enforcement
- [ ] Youth Protection guardrails (parent linkage, minor flags)
- [ ] SSO with Google / Apple / Microsoft

## Phase 3 — Database (Postgres)

Replace JSON store with a real DB. Two-pronged tenant isolation strategy:

- **Schema-per-tenant** for primary tables (members, events, photos, …)
- **Shared `tenants` and `users` tables** in `public` for routing/auth
- Migration tool (Knex / Prisma)
- Daily logical backups per tenant; export-to-zip on demand

## Phase 4 — Calendar & events

The most-used feature. Match TroopWebHost's coverage, then exceed it.

- [ ] Event CRUD (recurring, all-day, multi-day, location, cost)
- [ ] Sign-up sheets (capacity, food choice, gear, slots)
- [ ] RSVP tracking + reminders
- [ ] ICS feed per tenant + per user
- [ ] **One-click Google Calendar add** ("Add to my Google Calendar" button per
      event); also Apple Calendar and Outlook
- [ ] **Two-way Google Calendar sync** (per-user) so events appear and update
      live in members' personal calendars
- [ ] **Directions for every event** — auto-generated map link (Google Maps,
      Apple Maps, Waze) from the event location, plus carpool sign-ups
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

- [ ] Member CRUD with families (parent ↔ scout linkage)
- [ ] Patrols, Crews, Ships
- [ ] Dynamic subgroups (rules-based, e.g. "Star+ scouts")
- [ ] Position of Responsibility tracking with start/end dates
- [ ] Troop directory (visibility-gated)
- [ ] Birthdays, join dates, tenure reports
- [ ] Skills & interests per member

## Phase 6 — Advancement

- [ ] Rank progress with per-requirement sign-off
- [ ] Merit Badge tracking, partials, counselors
- [ ] Awards (religious, special, OA)
- [ ] Eagle project workflow with workbook upload
- [ ] Status reports (per-Scout, troop-wide)
- [ ] Scoutbook import (initial bulk + ongoing sync)
- [ ] Internet Advancement export

## Phase 7 — Photos & files

- [ ] S3-backed object storage per tenant
- [ ] Photo gallery: albums, captions, EXIF, faces opt-in
- [ ] Video gallery (link-based)
- [ ] Forms & Documents library (versioned, role-gated)
- [ ] Drag-and-drop upload, mobile capture

## Phase 8 — E-mail

- [ ] Transactional via SES/Mailgun, signed (DKIM, SPF, DMARC)
- [ ] Group e-mail (whole troop, patrol, subgroup)
- [ ] Inbox, Sent, Delivery Status (bounces, complaints)
- [ ] Reply threading
- [ ] Throttling and abuse protection

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
- Phase 6 (advancement) is what makes a unit migrate off TroopWebHost.
- Phases 7–10 round out feature parity.
- Phases 11–14 are differentiators against TroopWebHost.
