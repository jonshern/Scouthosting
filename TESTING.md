# Testing

How tests are organized, how to run them, and the gotchas that bite
when adding new ones. Stack-level traps live in `CLAUDE.md`; this file
is testing-specific.

## Two suites

- **Vitest unit / integration** — `src/**/*.test.{ts,tsx}`,
  `tests/vitest-setup.ts`. Run with `npm test` (or `npm run test:watch`).
  Pure-functional code (encryption primitives, calendar recurrence,
  markdown, parsers, validation) lives next to the module it tests.
  `*.db.test.ts` files run against real Postgres and are skipped
  unless `TEST_DATABASE_URL` points at a migrated, disposable DB:
  `TEST_DATABASE_URL=postgresql://postgres@localhost:5433/compass_test npm test`.
  `src/lib/api/v1-routes.db.test.ts` drives every `/api/v1` route
  handler this way (auth, org access, validation, rate limits).
- **Playwright + axe E2E** — `tests/e2e/*.spec.ts` (29 specs as of
  2026-05-06). Run with `npx playwright test`. Boots
  `npm run start` against a fresh `compass_test` database.

## Local prerequisites

```bash
docker compose up -d                 # Postgres on 5433 (override file remaps from 5432)
npm install
npm run db:deploy                    # apply migrations to the dev DB
npm run db:seed                      # seed scoutmaster + invite codes
```

`docker-compose.override.yml` (gitignored) remaps the host port to
**5433** because 5432 is usually held by another local Postgres
container — see `CLAUDE.md` trap #1.

## Seeded accounts

All passwords: `AdminPasswordTest123!` (see `ADMIN_PASSWORD` in
`prisma/seed.ts`).

| Email                          | Role          | Notes                                   |
| ------------------------------ | ------------- | --------------------------------------- |
| `scoutmaster@example.invalid`  | admin         | Default E2E account, member of troop100 |
| `super@example.invalid`        | super-admin   | `/super-admin` write-action tests       |

Seeded org: `troop100` (slug). Tenant URL: `http://troop100.localhost:3000/admin`.
Demo passphrase for the encrypted vault: `compass-demo-passphrase-12`
— recovery code is printed once to stdout when the seed first
provisions the vault.

## Pre-launch invite codes

The apex marketing site (`/`) is gated behind a Coming Soon page until
a visitor presents one of these. Seeded by `prisma/seed.ts`:

| Code                  | Label              | Max uses |
| --------------------- | ------------------ | -------- |
| `EAGLE-EXPLORE-2026`  | founders-batch-1   | 50       |
| `TRAILBLAZER-VIP`     | press / investors  | unlimited |
| `PATROL-PREVIEW`      | design partners    | 25       |

E2E tests bypass the gate via `DISABLE_INVITE_GATE=1`
(`playwright.config.ts:42`). For manual testing on staging, paste any
of the codes into the Coming Soon form.

## Running E2E

```bash
npx playwright test                  # full run (chromium only)
npx playwright test auth.spec.ts     # one file
npx playwright test --headed         # watch the browser
npx playwright show-report           # open the last HTML report
```

The webServer runs `npm run start` on port 3000 with these env vars
set (see `playwright.config.ts`):

- `DATABASE_URL` → `compass_test` on 5433 (separate DB from dev)
- `NODE_ENV=production` (mirrors production)
- `ALLOW_ADMIN_PASSWORD_LOGIN=1` — required because the policy gate
  (`src/lib/auth/policy.ts#passwordLoginAllowedForRole`) blocks
  email+password sign-in for admins when `NODE_ENV=production`.
  See `CLAUDE.md` trap #3.
- `JOBS_DISABLED=1` — pg-boss worker doesn't spin up
- `DISABLE_INVITE_GATE=1` — bypass apex Coming Soon
- `APEX_HOST=localhost`

`tests/e2e/global-setup.ts` runs `prisma migrate deploy` then
`tsx prisma/seed.ts` against `compass_test` before any spec executes.

## Reset to known state

```bash
npx prisma migrate reset --force     # drops compass + reapplies
npm run db:seed                      # reseed accounts + invite codes + chat channels
```

The seed is idempotent — re-running upserts every record and re-uses
the existing encryption vault so previously-encrypted Member rows stay
decryptable.

`make wipe` (or `make redeploy`) does the same against the dev DB
plus restarts the dev server.

## Flow specs and the link crawler

- `links.spec.ts` crawls every same-origin link from the apex (signed
  out) and troop100 (signed out, and signed in as the admin): each page
  must return < 400 with no uncaught page error. Known-broken links live
  in its `KNOWN_BROKEN` list, one entry per open bug; remove the entry
  when the bug is fixed (the crawl fails if a listed link starts
  working). External links are only fetched when `LINKCHECK_EXTERNAL=1`
  (the daily Outside links workflow sets it and files an
  `outside-links` issue instead of failing CI); a 404/410 fails, other
  errors are warnings.
- `events-rsvp`, `slots-waitlist`, `permission-slips`, `roles` and
  `youth-protection` drive those flows through the UI. Shared helpers
  are in `tests/e2e/helpers/`; `helpers/db.ts` holds the few direct DB
  writes for state with no screen yet (org roles, sign-up slots, chat
  channels) and mints the permission-slip link the email would carry.
- `account-security` covers two-step sign-in, phone-app sign-in, API
  token expiry/revocation, password change and email change.
  `mfa-required` checks the organizer two-step rule against a second
  server on **:3001** that playwright.config.ts starts without
  `ALLOW_ADMIN_WITHOUT_MFA` (same build, same database).

## Adding a new test

- **Unit / integration**: drop `foo.test.ts` next to the module
  under test in `src/`. Tests run in node env. Database access is fine
  but the suite shares a single `compass_test` DB — keep tests
  hermetic (use unique slugs / emails per test, prefer in-memory where
  possible).
- **E2E**: add `tests/e2e/my-feature.spec.ts`. Sign-in helper:
  `await page.goto("/login")` → submit `scoutmaster@example.invalid` /
  `AdminPasswordTest123!`. Two-deep / YPT enforcement applies in
  chat-related specs; test channels seeded by
  `provisionStandingChannelsInline` in `prisma/seed.ts`.

## Gotchas

- **`*.localhost` from Node** doesn't resolve on macOS. Browser
  navigation works (Chromium routes `*.localhost` → `127.0.0.1`); a
  `request.get` from a Playwright fixture against
  `troop100.localhost:3000` gets ENOTFOUND. Use
  `page.evaluate(() => fetch(...))` from the browser context, or add
  to `/etc/hosts`. See `CLAUDE.md` trap #2.
- **Master key in tests**: in absence of `MASTER_KEY`, the encryption
  layer falls back to an ephemeral per-process key (logged once to
  stderr). Each `npm test` / Playwright run uses its own key. If a
  test seeds encrypted data and then a new process tries to decrypt
  it, you'll get an HMAC mismatch — keep encrypted-row tests within
  a single process. See `CLAUDE.md` trap #8.
- **Per-org PII encryption**: encrypted Member columns (`firstName`,
  `lastName`, `phone`, `street`, `city`, `state`, `zip`) require the
  org's DEK to be unlocked first. Tests that need plaintext rows
  should call `unlockOrgVault(orgId, DEMO_PASSPHRASE)` (or use the
  seed's already-unlocked org) — direct Prisma queries return
  ciphertext.
- **`pg-boss` queue spam**: any test that boots the full app in a
  way that pulls `src/lib/jobs` will spam queue creates unless
  `JOBS_DISABLED=1` is set.
- **Don't reset the dev DB unprompted**: only `compass_test` is safe
  to nuke. `compass` may have hand-entered data from a parallel
  agent. See `CLAUDE.md` "Things to never do".
