# CLAUDE.md

Notes for future Claude sessions (and humans) working on Compass.
Non-obvious traps + how the project actually works in practice. Keep
this lean.

## Stack at a glance

- Node 22 · Next.js 16 · React 19 · Prisma 5 · Postgres 16 · Better Auth · argon2id · pg-boss · Tailwind
- Mobile: Expo / React Native (talks to `/api/v1/*` over HTTPS)
- Local infra: `docker-compose.yml` runs Postgres only; Next runs as a host Node process via `npm run dev`
- Deploy: `Dockerfile` at the repo root builds and runs `prisma migrate deploy && next start` on port 3000

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
`NODE_ENV === "production"`. Admins use Google or Apple SSO instead.

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
slots by pasting the Waypoint event file on the event's admin page.
It's passed through un-rewritten on tenant hosts.

`/auth/mobile/begin` is also apex-friendly (works without `req.org`)
so the mobile in-app browser can sign in at the apex.

Phone sign-in (Compass, Waypoint and Summit apps all use it; keep it
stable):

1. The app opens `/auth/mobile/begin?redirect=<scheme>://auth/callback`
   in an in-app browser. Production accepts only the schemes in
   `src/lib/auth/mobile-redirect.ts` (`compass`, `bluecard`, `waypoint`,
   `emmettjourney`, `summit`); dev also accepts `exp://` and localhost.
2. Signed out → `/login?next=…`, then back to step 1. A brand-new
   Google/Apple account confirms it's an adult first, and a leader or
   admin without two-step sign-in is sent to set it up
   (`src/lib/auth/requirements.ts`).
3. Signed in → `/auth/mobile/confirm`, where the user taps Continue
   (same-origin POST with CSRF back to `/auth/mobile/begin`).
4. 303 to `<redirect>?token=compass_pat_…&userId=…&displayName=…`.
   The app sends `Authorization: Bearer <token>` to `/api/v1/*`.
   Tokens expire after 90 days, die when the password changes, and
   `DELETE /api/v1/auth/token/<id>` revokes one.

### 5. pg-boss v12 needs `createQueue` before `work`

v12 introduced a stricter queue model. `src/lib/jobs/index.ts` calls
`boss.createQueue(name)` before `boss.work(name)` for each registered
handler. Tests run with `JOBS_DISABLED=1` so the worker never spins
up against `compass_test`.

### 6. Photos / uploads on Fly are ephemeral when storage=local

`STORAGE_DRIVER=local` writes to `/app/var/uploads/*` which doesn't
survive container restart on Fly. Use `STORAGE_DRIVER=s3` (or `gcs`)
with a real bucket in production. The drivers lazy-load
`@aws-sdk/client-s3` / `@google-cloud/storage` so the deps are only
required when actually used.

### 7. `__super` doesn't route in Next.js

Next treats underscore-prefixed folders as private. The super-admin
surface lives at `/super-admin` (not `/__super`) — folder is
`src/app/super-admin/`.

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

### 9. Stripe SDK is optional

`src/lib/billing/stripe.ts` lazy-imports `stripe` and surfaces a 503
if the SDK isn't installed or `STRIPE_SECRET_KEY` is unset. Builds
without the package; webhook verification is implemented locally so
the test path doesn't need the SDK either.

### 10. Commit every migration folder

`prisma/migrations/` used to be in `.gitignore`, so new migration
folders silently stayed local and `prisma migrate deploy` in production
never created their tables. It's tracked normally now; check
`git status` shows your new folder before pushing a schema change.
CI runs `prisma migrate diff --exit-code` after applying migrations, so
a schema change without a matching migration fails the build. Back up
the database before deploying any migration that deletes rows (for
example `20261011130000_align_constraint_names` clears orphaned rows).

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
Server code reads the user with `getSession()` from
`src/lib/auth/session.ts`. The DB-backed auth tests in
`src/lib/auth/auth.db.test.ts` run only when `TEST_DATABASE_URL` is set.

## Demo accounts (test DB)

Password for all seeded accounts: `AdminPasswordTest123!`
(see `ADMIN_PASSWORD` in `prisma/seed.ts`).
- `scoutmaster@example.invalid` — admin in troop100. The default
  E2E account (`prisma/seed.ts` seeds this user).
- `super@example.invalid` — super-admin (`/super-admin`).

Pre-launch invite codes (apex marketing site is gated behind these
until launch — see `src/lib/invite/`):
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
- Persistent uploads on Fly via `STORAGE_DRIVER=s3` + a real bucket
