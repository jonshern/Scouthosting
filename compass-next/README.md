# compass-next

The Next.js 16 rewrite of Compass. Sits **alongside** the existing
Express app at the repo root during the migration so the production
app keeps shipping while we port one feature at a time.

## What's converted (session 1)

- **Apex marketing site**: home, pricing, security, pitch, positioning
- **Auth**: signup, login, logout — Lucia 3 + argon2id, CSRF, honeypot,
  per-IP rate limit
- **Multi-tenant routing**: `troop100.localhost:3000` → `/o/troop100/...`
  via Next.js middleware; custom-domain branch in place
- **Per-tenant site**: org home, header w/ brand colors, suspended-state
  banner
- **Per-tenant admin shell**: leader-role-gated, sidebar nav, overview
  stats, announcement create/list
- **Health probe**: `/health` for orchestrators
- **Test setup**: Vitest unit + Playwright E2E with isolated `compass_test`
  DB and a deterministic seed

## What still lives in the Express app

Everything else — calendar, photos, chat, mail, newsletter, forms,
trip/meal planner, Scoutbook deep-links, member directory, custom
pages with the page editor, super-admin, mobile-API endpoints.
Migration roadmap below.

## Run it

```bash
# from repo root
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER compass WITH PASSWORD 'compass' SUPERUSER;"
sudo -u postgres psql -c "CREATE DATABASE compass OWNER compass;"
sudo -u postgres psql -c "CREATE DATABASE compass_test OWNER compass;"

cd compass-next
npm install
npx prisma generate
npm run db:deploy
npx tsx tests/seed.ts            # seeds dev account
npm run dev                       # localhost:3000
```

Test logins: `scoutmaster@example.invalid` / `AdminPasswordTest123!`.

`*.localhost` subdomains: add to `/etc/hosts` if your resolver doesn't
auto-route them (most modern systems do).

```
127.0.0.1 troop100.localhost troop999.localhost
```

## Tests

```bash
npm test                          # 19 unit tests
npm run test:e2e                  # 16 Playwright tests against prod build
npm run typecheck
npm run lint
```

The E2E run does a `next build` + `next start` against the test DB
(`compass_test`). The `globalSetup` re-applies migrations and re-seeds.

## Architecture

### Tenancy

Subdomain → Org row, resolved in `src/middleware.ts`. The
`*.<APEX_HOST>` form maps slug; an unrelated host falls back to a
`customDomain` lookup. Apex (`localhost:3000` /
`compass.app` / `www.compass.app`) renders the marketing layout.

Tenant requests are **rewritten** to `/o/<slug>/...`. Pages under
`/login`, `/signup`, `/logout` pass through unchanged so a tenant
subdomain shares the apex's auth UI.

### Auth

Lucia 3 + Prisma adapter. Sessions live in `Session`. Cookies are
HTTP-only, `SameSite=Lax`. Cookie domain controlled by
`COOKIE_DOMAIN` env so a session set on the apex (after Google OAuth,
landing soon) is valid on every tenant subdomain.

Password hashing: argon2id with the OWASP recommended params. Passwords
are nullable on `User` so OAuth-only accounts will exist once OAuth
lands.

### CSRF

A 256-bit token is set in the `compass_csrf` cookie by the middleware
on first hit (and re-issued if missing). Server actions verify
`origin` then constant-time-compare the form's `_csrf` field to the
cookie. Hidden honeypot field + a min-dwell-time stamp deters bots.

### Per-tenant admin

`/o/<slug>/admin` requires:
1. Signed in (`getSession()`),
2. Either `OrgMembership.role` ∈ `{leader, admin}` or `User.isSuperAdmin`.

If signed-out → redirect to `/login?next=...`. If signed-in but not a
leader → friendly "not authorized" page.

### Schema

`prisma/schema.prisma` is a symlink to the parent repo's schema —
both apps share the same DB and migrations. Migrations stay where the
existing Express app expects them; this app just deploys them.

## Migration roadmap

Order chosen to keep both apps running. Each item is a follow-on PR
that ports an Express route + its lib helpers, with E2E coverage.

### Tier 1 — already done (this PR)
- Marketing site
- Auth (sign up / sign in / sign out)
- Multi-tenant subdomain routing
- Tenant home + suspended banner
- Tenant admin shell + announcements

### Tier 2 — content + comms (next)
- **Page editor**: port `lib/blocks/`, `admin/site-editor/`,
  `Page` / `PageVersion` models. Block-based RSC renderer.
- **Custom pages**: `CustomPage` admin + public render
- **Calendar**: `Event` + `EventCategory` + `Rsvp` admin + `iCal` feed
  + Google Calendar add-button per event
- **Photos**: `Album` + `Photo` upload (port `lib/storage.js` first to
  TS as `platform-storage` package candidate), gallery rendering
- **Group email**: `Newsletter` + `MailLog` + `MailEvent` + Resend
  webhook + per-org sender domain (`OrgEmailDomain` candidate)

### Tier 3 — engagement
- **Posts** + `PostReaction` + `Comment`
- **Chat**: `Channel` / `ChannelMember` / `Message` / `Reaction` (port
  `lib/chat.js` + `lib/chatPermissions.js`; the two-deep guard is the
  highest-stakes piece — port with extreme care + a full unit-test
  port of every guard branch)
- **Push**: `PushDevice` + web-push (the iOS-best-effort caveat lives
  here)
- **DM digest cron**: porter for `lib/dmDigestCron.js` runs as a
  Vercel/Fly cron route or as a pg-boss handler

### Tier 4 — operations
- **Trip + meal planner**: `TripPlan` / `Meal` / `Ingredient` /
  `GearItem` + the headcount → recipe scaling → shopping list pipeline
  (port `lib/shoppingList.js`, `lib/dietary.js`)
- **Forms**: `Form` + dynamic field rendering + submission storage
- **SignupSlots**: `SignupSlot` / `SlotAssignment`
- **Reimbursements** + **Refunds**

### Tier 5 — youth program specifics
- **Scoutbook deep-links** (`lib/scoutbook.js`)
- **PositionTerm** management
- **EagleScout** / **EagleProject** / **CohAward** / **Training**
  rosters
- **OaCandidate** / **OaElection**
- **MeritBadgeCounselor**

### Tier 6 — billing + admin
- **Stripe**: subscription + Customer Portal + webhook (port
  `lib/stripe.js`, `lib/billingState.js`, `lib/plans.js`)
- **Super-admin** (`/__super` apex-only) — port the heavy
  `server/superAdmin.js` last; it's purely operator UI.
- **API tokens** + **mobile API** at `/api/v1/*` for the Expo app

### Tier 7 — observability + retired
- **OpenTelemetry** bootstrap (port `lib/otel.js`)
- **ErrorLog** writer (port `lib/errorTracker.js`)
- **AuditLog** consistent across all writes
- Retire `server/index.js` once parity is proven on staging

## Conventions kept from silent-auction (and recommended for product 3)

- TypeScript end-to-end, `tsc --noEmit` in CI.
- Server Components by default; `"use client"` only for forms / live
  updates.
- Server Actions as the only mutation path, every one of which calls
  `verifyOrigin()` + `verifyCsrf()` first.
- Cents as integers when money lands.
- UTC in DB, render in `event.timezone` when calendar lands.
- Audit every leader-side write.
- Accessibility is a gate, not a polish — axe-core in CI is the next
  add-on.
