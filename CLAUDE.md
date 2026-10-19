# CLAUDE.md

Notes for future Claude sessions (and humans) working on Compass.
Non-obvious traps + how the project actually works in practice. Keep
this lean.

## Stack at a glance

- Node 22 · Next.js 16 · React 19 · Prisma 5 · Postgres 16 · Better Auth · argon2id · pg-boss · Tailwind
- Mobile: Expo / React Native (talks to `/api/v1/*` over HTTPS)
- Local infra: `docker-compose.yml` runs Postgres only; Next runs as a host Node process via `npm run dev`
- Deploy: `Dockerfile` at the repo root builds an image that runs `next start` on port 3000 (no npm in the image; migrations are a separate step, `scripts/migrate.sh`). Target is Cloud Run, deployed blue-green (`scripts/deploy-api.sh`, rollback with `scripts/rollback-api.sh`) (`infra/`, `docs/gcp-deployment.md`); until the GCP project exists Compass runs on Jon's Mac. fly.io is shut down.

## Layout

```
src/            # Next.js app — server components + server actions + route handlers.
tests/          # Vitest unit tests + Playwright E2E (tests/e2e/).
prisma/         # Schema + migrations.
mobile/         # Expo client.
Dockerfile      # Single deploy target.
```

The legacy Express app (`server/`, root `lib/`, `admin/`, root `*.html`)
was retired in the cutover; the `compass-next/` subdirectory was
flattened to root afterward. There is no Express runtime anymore.

## Traps that have actually bitten this repo

### 1. macOS local-port gotchas

- **Port 5000** is held by Control Center (AirPlay Receiver). Don't
  bind there.
- **Port 5432** may be taken by another Postgres container. The
  gitignored `docker-compose.override.yml` remaps to **5433:5432**;
  `.env` and `playwright.config.ts` already point at 5433.

### 2. `*.localhost` DNS quirks on macOS

- Chromium auto-resolves `*.localhost` to `127.0.0.1`. Browser-based
  E2E (page.goto) works without any /etc/hosts entries.
- Node's resolver does **not** auto-route `*.localhost` on macOS, so
  Playwright's `request.get` and standalone `node:http` calls against
  `troop100.localhost` will ENOTFOUND. Workaround: do the request from
  inside the Chromium context via `page.evaluate(() => fetch(...))`,
  or add to `/etc/hosts`.

### 3. `NODE_ENV=production` blocks admin password login (with bypass)

`src/lib/auth/policy.ts#passwordLoginAllowedForRole` rejects email +
password sign-in for any user holding `admin`/`isSuperAdmin` when
`NODE_ENV === "production"`, unless they have two-step sign-in set up
(then the password leads to the code prompt). Otherwise admins use
Google or Apple. A unit made at `/start` has a password admin, who is
sent to set up two-step before the admin pages open.

**Escape hatch for staging / QA**: `ALLOW_ADMIN_PASSWORD_LOGIN=1`
bypasses the SSO requirement. Already set in
`playwright.config.ts#webServer.env` so E2E tests can sign in as the
seeded admin.

**Never set this in real production.**

### 4. Multi-tenancy = Host header, except for `/api/v1/*`

The web layer routes by Host header → `req.org` (resolved in
`src/middleware.ts`). Either subdomain match (`troop100.compass.app`)
or `Org.customDomain` exact match.

The `/api/v1/*` routes don't care about Host — they take a bearer
token, look up the user, resolve the org from path params or token
claim. That's why mobile works against any host with no wildcard DNS.

Every v1 route is built with `v1Route()` from `src/lib/api/v1.ts`: it
does bearer auth, Postgres-backed rate limits (`RateLimitBucket`, keyed
on the platform's client-IP header only; see `CLIENT_IP_HEADER` in
`.env.example`), `{ error: "<code>" }` error shapes and `no-store`.
Use `requireOrgAccess` / `requireOrgAccessForResource` for membership
and `readJson` / `readQuery` with a zod schema for input.

One public, unauthenticated JSON route sits outside v1:
`POST /api/events/<publicSlug>/signups` (Waypoint's badge day sign-ups,
`src/lib/events/public-signup.ts`). It addresses events by
`Event.publicSlug` and slots by `SignupSlot.key` (`station:<id>`,
`role:<id>`); leaders set the slug on the event form and create keyed
slots by pasting the Waypoint event file on the event's admin page,
which also turns on the event's "Sign-up required" (the route refuses
events without it).
It's passed through un-rewritten on tenant hosts.

`/auth/mobile/begin` is also apex-friendly (works without `req.org`)
so the mobile in-app browser can sign in at the apex.

Phone sign-in (Compass, Waypoint and Lantern apps all use it; keep it
stable):

1. The app opens `/auth/mobile/begin?redirect=<scheme>://auth/callback`
   in an in-app browser. Production accepts only the schemes in
   `src/lib/auth/mobile-redirect.ts` (`compass`, `bluecard`, `waypoint`,
   `emmettjourney`, `lantern`); dev also accepts `exp://` and localhost.
   Production accepts `exp://` only from a dev server listed in
   `EXPO_GO_SIGNIN_HOSTS` (the Mac's Tailscale `host:port` running Lantern).
2. Signed out → `/login?next=…`, then back to step 1. A brand-new
   Google/Apple account confirms it's an adult first, and a leader or
   admin without two-step sign-in is sent to set it up
   (`src/lib/auth/requirements.ts`).
3. Signed in → `/auth/mobile/confirm`, where the user taps Continue
   (same-origin POST with CSRF back to `/auth/mobile/begin`).
4. 303 to `<redirect>?token=compass_pat_…&userId=…&displayName=…`.
   A website can use the same flow with `redirect=<origin>/signed-in`
   when its exact origin is in `WEB_SIGNIN_ORIGINS` (https only in
   production; any other path or origin is refused). It gets the same
   values after `#` instead of `?`, so the token stays out of server logs
   and Referer headers; Waypoint's website reads them from
   `location.hash`.
   The app sends `Authorization: Bearer <token>` to `/api/v1/*`.
   Tokens expire after 90 days, die when the password changes, and
   `DELETE /api/v1/auth/token/current` (sign-out) revokes the token
   that calls it; `DELETE /api/v1/auth/token/<id>` revokes any of yours.

Lantern's saved trails are `/api/v1/journey/*` (`src/lib/journey/`):
a signed-in adult adds the scouts they follow (`JourneyScout`, no
troop needed) and checks steps off (`JourneyProgress`, keys like
`rank:second-class#1a`). A scout linked to a troop roster entry the
user is a parent of (confirmed email only) also shows that troop's
`RequirementProgress` sign-offs; Lantern never writes those. Sign-up
keeps `?next=` so a new account made from the app's sign-in returns
to the app.
Scouts never get an account: the parent makes a one-time code
(`POST /journey/scouts/<id>/pair-code`), the scout's device trades it at
`POST /journey/pair` for a `lantern_scout_…` token
(`src/lib/journey/devices.ts`) that only reads and checks off that one
trail (`/journey/scout`, `/journey/scout/progress`); steps it checks are
`checkedBy: "scout"`. Those routes use `v1PublicRoute` and authenticate
with `requireScoutDevice`, never `v1Route`.

A whole trail exports as a file families keep
(`/api/v1/journey/scouts/<id>/export?format=json|xlsx|zip`, and
`/account/trails` on the web) and imports back as a new scout, or adds
only what's missing to one (`POST /api/v1/journey/import`,
`src/lib/journey/trail-file.ts`, format `lantern-trail` v1, which
Lantern also writes for a phone-only trail). New trail data must go in
that file and in `scripts/host/carry-journey.sh`.

Logs, notes, proof photos and "ready" marks on a requirement are
`JourneyEntry` rows (`/api/v1/journey/scouts/<id>/entries`, CSV at
`entries/export`), addressed by the device's `clientId` so an offline
retry never adds twice; note text and photos are encrypted per owner.

Google and Apple lead `/login`, `/signup` and `/start` when their keys
are set (`src/components/auth/SocialSignIn.tsx`, hidden otherwise;
`docs/sign-in-providers.md`), each host using its own
`/api/auth/callback/<provider>` unless `*_REDIRECT_URI` pins one.
Passkeys come next, in that in-app browser too: `/login`
shows "Continue with a passkey" after Google/Apple, with email +
password folded behind "Use email and password instead" (open on
browsers without passkeys; opening it starts passkey autofill in the
email field). New accounts land on `/account/passkey`, which offers to
make one before continuing. E2E specs unfold the password form with
`showPasswordSignIn()` from `tests/e2e/helpers/flows.ts`. The passkey
must belong to the host the app opened
(`src/lib/auth/passkeys.ts#relyingPartyForHost`):

- the apex and every `<slug>.<apex>` subdomain share one relying-party
  ID, the apex, so a passkey made on `troop100.compass.app` works on
  `compass.app` and every other unit;
- an `Org.customDomain` is its own relying party, so its passkeys only
  work there;
- `localhost` and each `*.localhost` host are their own relying party
  (browsers won't take `localhost` for a subdomain), so on the Mac and
  in e2e a passkey made on `localhost` doesn't work on `troop100.localhost`;
- `PASSKEY_EXTRA_HOSTS` (comma-separated) adds hosts that are their own
  relying party, such as the Mac's Tailscale name. Browsers require
  https for those.

Any other host gets no passkey button. Changing `APEX_HOST` or a custom
domain strands the passkeys made on the old one; people sign in another
way and add a new one.

### 5. pg-boss v12 needs `createQueue` before `work`

v12 introduced a stricter queue model. `src/lib/jobs/index.ts` calls
`boss.createQueue(name)` before `boss.work(name)` for each registered
handler. Tests run with `JOBS_DISABLED=1` so the worker never spins
up against `compass_test`.

### 6. Photos / uploads in a container are ephemeral when storage=local

`STORAGE_DRIVER=local` writes to `/app/var/uploads/*` which doesn't
survive a container restart (Cloud Run instances have no disk). Use `STORAGE_DRIVER=s3` (or `gcs`)
with a real bucket in production. The drivers lazy-load
`@aws-sdk/client-s3` / `@google-cloud/storage` so the deps are only
required when actually used.

### 7. `__super` doesn't route in Next.js

Next treats underscore-prefixed folders as private. The super-admin
surface lives at `/super-admin` (not `/__super`) — folder is
`src/app/super-admin/`. It's the owner console for all three products
(units and licenses, people, errors, audit); `isSuperAdmin` is set only
by `npm run owner:grant -- <email>`. Every console write goes through
`src/server-actions/super-admin.ts` and is audit-logged. Free access is
`Org.compedUntil` (billing treats the unit as paid, Stripe untouched);
`User.disabledAt` turns an account off (sessions and tokens revoked,
the Better Auth session hook refuses new ones).

### 8. Per-org encryption: `MASTER_KEY` env var is required in production

Roster PII (`Member.firstName`, `lastName`, `phone`, `street`, `city`,
`state`, `zip`) and photo file bytes are encrypted at rest with a
per-org Data Encryption Key (DEK). The DEK is wrapped three ways:

- by `MASTER_KEY` (32-byte hex env var) — server's daily read/write
  path. Generate with `openssl rand -hex 32`.
- by `scrypt(orgPassphrase)` — admin-chosen at provisioning, used to
  re-key after a master-key rotation.
- by HKDF of a server-generated **recovery code** shown to the admin
  once and downloadable.

In dev/test, `MASTER_KEY` falls back to an ephemeral per-process key
(logged to stderr). In production the app refuses to boot without it.

`src/lib/encryption/{primitives,master-key,vault,field}.ts` is the
public surface. `src/lib/members/crypto.ts` is the adapter for
encrypted Member rows. The super-admin **Architecture & Security**
page at `/super-admin/architecture` lists the encrypted-fields table
and the verification runbook.

The seeded demo org's passphrase is `compass-demo-passphrase-12`; its
recovery code is printed once during `npm run db:seed`.

Email is **plaintext on purpose** so background email, magic links,
and chat membership lookups don't need an unlock ceremony.

### 9. Billing: 3-month trial, Stripe over plain fetch

`/start` creates an adult account and a unit with a free trial and no
card (`src/lib/provision/self-serve.ts`): 90 days, or `TRIAL_DAYS` from
env, and the marketing copy follows it (`freePeriod()`). Owners get
trial-end emails 7 days and 1 day out once Stripe is set up
(`src/lib/billing/trial-reminders.ts`, from the cron tick). Waypoint's
counselor tools are free for every adult and must never check a unit's
billing (`src/lib/billing/entitlements.ts`, in `GET /api/v1/auth/me`); `admin/billing` sends admins
to Stripe Checkout, which carries the rest of the trial over as
`trial_end`. Prices ($99/yr, $10/mo) live in `src/lib/billing/pricing.ts`
and must match `STRIPE_PRICE_YEARLY` / `_MONTHLY`. `src/lib/billing/stripe-rest.ts` calls Stripe's HTTPS API
directly, so there's no `stripe` package. Webhooks are the only writer
of the Org's Stripe fields. `billingSummary` (`src/lib/billing/trial.ts`)
decides the admin lock; nothing locks unless `isConfigured()` sees a real
`sk_`/`rk_` key and a `price_` ID, and orgs with no `trialEndsAt` (made
before self-serve) never lock. Setup and runbook: `docs/billing.md`.

### 10. Commit every migration folder

`prisma/migrations/` used to be in `.gitignore`, so new migration
folders silently stayed local and `prisma migrate deploy` in production
never created their tables. It's tracked normally now; check
`git status` shows your new folder before pushing a schema change.
CI runs `prisma migrate diff --exit-code` after applying migrations, so
a schema change without a matching migration fails the build. Back up
the database before deploying any migration that deletes rows (for
example `20261011130000_align_constraint_names` clears orphaned rows).

Migrations must be **expand-only**: deploys are blue-green, so the
previous revision runs on the new schema until traffic flips and again
after a rollback. Add tables, nullable or defaulted columns and indexes;
don't drop, rename, retype or `SET NOT NULL` in the same release that
stops using something. CI's *Expand-only migrations* job fails those
two ways: `scripts/check-migrations.sh` greps for the keywords, and
`scripts/check-migrations-schema.sh` applies the new migrations to the
base branch's schema and fails if any column, table, key, unique index
or enum value disappears or a column changes type, gains NOT NULL or
loses its default, however the SQL is written. A later contract
migration carries a `-- contract: <reason>` line. Also give a new migration a
timestamp later than every migration on `main`.

### 11. CI

`.github/workflows/ci.yml` runs typecheck, lint, unit + `*.db.test.ts`
suites (against a Postgres service via `TEST_DATABASE_URL`) and the
Playwright suite on every PR. `*.db.test.ts` files share one database
and run in parallel: clean up only rows your test created.

### 12. Sign-in is Better Auth, with Compass's own MFA in front

`src/lib/auth/auth.ts` configures Better Auth (sessions, password,
Google/Apple, email verification). Passwords live on the `Account` row
with `providerId = "credential"`, not on `User`. Compass's TOTP + backup
codes stay in `User`/`BackupCode`; `src/lib/auth/mfa-plugin.ts` swaps a
new session for a signed challenge cookie until the code is checked.
Passkeys (`src/lib/auth/passkeys.ts`, `@simplewebauthn/server`, table
`Passkey`) are added on `/account/security` within an hour of signing
in. Signing in with one is complete on its own (the device checks a
fingerprint, face or PIN), so it isn't held for a second step or for
the admin SSO rule. After a password or Google/Apple sign-in, the
second step is asked for when the user has an authenticator app, or is
a leader/admin with a passkey; either one satisfies the leader/admin
two-step rule, and `mfaLocked` stops them removing the last one.
Challenges are single-use `Verification` rows; the plugin endpoints are
blocked over HTTP and called from `src/server-actions/passkeys.ts`.
`src/lib/auth/soft-authenticator.ts` is a software passkey for tests.
Server code reads the user with `getSession()` from
`src/lib/auth/session.ts`. The DB-backed auth tests in
`src/lib/auth/auth.db.test.ts` run only when `TEST_DATABASE_URL` is set.

### 13. Treasury is for admins and the treasurer, not every leader

`src/lib/auth/treasury-access.ts#canManageTreasury` gates the treasury
pages (`admin/treasury/layout.tsx`), its CSV routes, refunds,
reimbursements and every treasury server action. A `leader` gets in only
when their roster entry (Member matched by email) has a treasurer
position (Treasurer, Purser, Cookie Manager, …; see
`src/lib/auth/permissions.ts`). New money surfaces must call it too;
layouts don't cover route handlers.

### 14. Signed links never use a key from the source code in production

RSVP, permission-slip, unsubscribe and invite links get
their HMAC key from `src/lib/security/link-secret.ts`: the link's own
variable (`RSVP_SECRET`, `PERM_SLIP_SECRET`, `UNSUB_SECRET`,
`INVITE_SECRET`), then `SESSION_SECRET`, then
`BETTER_AUTH_SECRET`. In production a missing or short (< 32 chars) key
throws instead of falling back; the built-in keys are for dev and tests
only. The pre-launch invite cookie (`src/lib/invite/cookie.ts`) follows
the same rule with static reads because it runs in middleware.

### 15. Demo mode is a whole deployment, not an org

`DEMO_MODE=1` (`src/lib/demo/`, `docs/demo.md`) turns a deployment into
the public demo: sample Troop 42, four shared accounts (password
`TryTheDemo42!`), mail and SMS captured to `/demo/outbox`, sign-up and
password/email/two-step changes refused, and a wipe-and-reseed of every
table on a schedule. It needs its own database; the reset refuses if any
`Org.isDemo = false` row exists. `Org.isDemo` alone (the troop100 seed)
only skips billing. New code that sends mail or texts must go through
`sendMail` / `sendSms` so the demo catches it. Its sign-in cookies are
`compass_demo_*` (`COOKIE_PREFIX`, `src/lib/env.ts`), so on one host name
it never shares a session cookie with a real Compass; browsers ignore
the port when scoping cookies. `make demo` runs it on
:3100 against `compass_demo`.

### 16. Deleting an account anonymizes the User row

`/account/delete` and `DELETE /api/v1/me` (`src/lib/account/delete.ts`)
keep the `User` row, renamed "Former member" with an undeliverable
address, so unit records (chat logs, RSVPs, staffing, counselor
meetings, sign-offs) keep their foreign keys. They delete what's personal
to the account: sign-ins, passkeys, sessions, tokens, devices, memberships,
reactions, the counselor listing, Lantern trails. A new table holding a
user's own data should be added to that list; one holding a unit's
records shouldn't cascade from `User`.

### 17. The Claude connector is its own OAuth server

`/mcp` (`src/lib/mcp/`, `docs/mcp.md`) is an MCP server people add to
Claude by URL. Compass is the OAuth 2.1 server for it, separate from
Better Auth: `McpClient` / `McpAuthCode` / `McpToken`, hashes only,
PKCE S256, rotating refresh tokens. Tools run as the signed-in adult and
see only `accessibleScouts()` (family by confirmed email, units they
lead, their own Lantern scouts; youth get nothing). New tools must pick
the scout through `pickScout(accessibleScouts(user), …)` and go through
`guarded()` for the scope check. Writes preview first and need
`confirm: true`. `MCP_PUBLIC_URL` must match the URL people paste into
Claude, or every call is 401. `CATALOG_PATH` loads requirement names.

### 18. Usage tracking is first-party and cookie-free

Page and screen views and key actions from the landing page, Compass,
Waypoint and Lantern go to `POST /api/v1/usage` (`src/lib/usage/`) and
show at `/super-admin/analytics`. No third-party analytics, no cookies,
no IP stored: signed-out visitors get a daily hash whose salt
(`UsageSalt`) is deleted the next day. Nothing is recorded from scouts
(Lantern outside grown-up mode, scout devices, scout logins), and paths
go through `scrubPath`. Server code records key actions with `recordAction()`; a new one
gets a label in `ACTIONS` (`events.ts`). Rows go after 13 months, with
the account, the Lantern trail and the scout retention purge; the
privacy draft (`business/drafts/privacy-policy.md`) describes all this,
so keep it in step.

### 19. People join a unit through the roster

Only the founder gets in at `/start`. Everyone else joins by email:
an active adult `Member` whose email matches a confirmed account gets
an `OrgMembership` with role `parent` (`src/lib/members/access.ts`,
run after email confirmation, on Google/Apple sign-up, and on the
unit's `/join` page). Leaders send the invite from the roster
(`src/server-actions/unit-access.ts`); only admins raise someone to
leader or admin, on that person's roster page. Never join on an
unconfirmed email. Joining refreshes the unit's standing chats.

## Demo accounts (test DB)

Password for all seeded accounts: `AdminPasswordTest123!`
(see `ADMIN_PASSWORD` in `prisma/seed.ts`).
- `scoutmaster@example.invalid` — admin in troop100. The default
  E2E account (`prisma/seed.ts` seeds this user).
- `super@example.invalid` — super-admin (`/super-admin`).

Invite codes (the apex Coming Soon gate is off unless `INVITE_GATE=1`;
sign-up is open — see `src/lib/invite/`):
- `EAGLE-EXPLORE-2026` — founders-batch-1, 50 uses
- `TRAILBLAZER-VIP` — press / investors, unlimited
- `PATROL-PREVIEW` — design partners, 25 uses

The full Pack 100 + Troop 100 demo data set was seeded by the
legacy Express seeder; it can be regenerated by extending
`prisma/seed.ts` if needed.

## Workflow patterns that work

### Local dev loop

```bash
npm run dev              # localhost:3000, host hot-reload
# in another terminal
npx playwright test      # full E2E (95 tests)
```

### Reset to known state

```bash
npx prisma migrate reset --force   # drops compass + reapplies
npm run db:seed                    # seeds scoutmaster + standing channels
```

### Mobile dev loop

```bash
cd mobile
npm run start
```

Set `EXPO_PUBLIC_COMPASS_BASE_URL=http://localhost:3000` in `mobile/.env`
to point the simulator at the host machine.

## Things to never do without explicit permission

- Don't push to `main` if the working tree has uncommitted code from a
  parallel agent. Check `git status` first.
- Don't `prisma migrate reset` against the dev DB (`compass`) without
  asking — only `compass_test` is safe.
- Don't add cloud secrets to `.env` and commit them. `.env` is
  gitignored; deploy secrets go via your orchestrator's secret store.

## Open follow-ups

- Mobile org-picker UI for multi-org users
- LISTEN/NOTIFY layer on top of `src/lib/realtime/bus.ts` for
  multi-pod realtime
- TestFlight pipeline (gated on Apple Developer enrollment)
- OTel SDK init in `src/instrumentation.ts` (currently only fatal
  handlers + jobs runtime)
- Persistent uploads in production via `STORAGE_DRIVER=gcs` + the Terraform bucket
