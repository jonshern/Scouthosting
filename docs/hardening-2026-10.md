# Compass reliability pass, October 2026

What could hurt a real troop, ranked by how bad and how likely, and
where each item stands. "Fixed" links the PR; "Open" items are the
next ones to take, in order.

## Fixed

| # | Risk | What went wrong | Fix |
|---|------|-----------------|-----|
| 1 | Lost data | No backups on the host Mac, no restore ever tried | Nightly backup with manifest and checksums, weekly restore drill into a scratch database that unwraps every unit's key, watchdog alerts on a stale backup or failed drill (#151) |
| 2 | Downtime | Deploys stopped the only server, built in place, no way back | Blue-green slots behind a switch, health and sign-in page checked on the new slot before traffic flips, one-command rollback (#151) |
| 3 | Lost data | A migration could drop or narrow what the running version reads; the keyword check missed `DROP "col"` without COLUMN, `DROP INDEX`, copy-and-swap tables | Schema-diff check: applies each new migration to the base schema and fails on anything lost unless marked `-- contract:` (#154) |
| 4 | Wrong money | A Stripe payment delivered as two events, or retried, posted twice; a sales order settled by a leader and the webhook at once posted twice; a transaction could be reversed twice; double-tapped event RSVPs charged twice | `applyStripeOnce` keyed on the effect, row locks and a unique constraint on reversals (#155) |
| 5 | Outage | Missing env failed at the first request, not at boot; unexpected errors showed Next's raw page; Prisma conflicts were 500s; mail calls could hang a request forever | Boot-time env check, error pages, 409/404 mapping, 15s mail timeouts (#156) |
| 6 | Slowness | Missing indexes on hot lookups (RSVPs by member, sessions by expiry, photos by album); expired sessions never deleted; chat and iCal loaded everything | 9 indexes, hourly prune of expired auth rows, bounded queries (#156) |
| 7 | Broken site on the Mac | Sign-out, Google/Apple landing, phone sign-in and permission slip signing redirected to `localhost:3001` (the slot's own address) | Relative redirects; static test bans resolving against `req.url` (#158) |
| 8 | Phishing | Click-tracking route redirected anywhere when its token didn't verify; emailed links built from the client-controlled Host header and broken when sent from a troop subdomain | Interstitial instead of a blind redirect; links from `APEX_HOST` (#158) |
| 9 | Access | Admin pages relied on the layout's check, which an RSC request can skip | Every admin page checks itself (#157, code health thread); every server action reaches a role check or is listed with a reason, enforced by `src/server-actions/access.test.ts` (#158) |
| 10 | Lost data | Retention purge deleted a parent's sign-ups that shared the scout's email | Email match only when no one else in the unit uses the address (#159) |
| 11 | Silent outage | Production mail fell back to the console driver when the Resend key was missing; verification email failures were ignored | Refuse to start with a half-set mail config; `/health` reports the driver; send failures are captured (#161) |
| 12 | Lost mail | Broadcasts sent inline in the request; a big send could time out halfway with no record | One queued job per recipient; the composer shows "Sending to N" and the mail log fills in as jobs finish (#165) |
| 13 | Lost records | A family's progress update racing a counselor's sign-off could undo the sign-off | Member row lock around read, permission check and write (#166) |
| 14 | Access | Invite `maxUses`, TOTP codes and backup codes were read-then-write; two requests could both use one | Conditional updates claim each use once (#168) |
| 15 | Wrong money | Cancelling a paid sales order kept the money in the ledger | Cancel or reopen reverses every posting tied to the order (#171) |
| 16 | Outage | A database blip on the custom-domain lookup in middleware turned every request into a 500; a double tap on a slot claim showed an error | Stale cache or a 503 with Retry-After; idempotent web claims (#173) |
| 17 | Overbooking | Event capacity was never checked on RSVP; equipment loans ignored quantity; a slot that grew kept its waitlist | Row-locked checks on all three RSVP paths and on loans; growing slots promote and email the waitlist (#175) |
| 18 | Outage | pg-boss opened 10 connections per process; prod, staging and a green revision could exhaust Cloud SQL's 50; public albums loaded every photo | Pools of 4 + 2 per process, budget in `docs/gcp-deployment.md`; albums show 60 per page (#176) |
| 19 | Downtime on the Mac | A `brew upgrade` could move Node to a new major; reboots and macOS updates left Compass down until someone signed in | `make deploy` refuses a Node major other than `.nvmrc`; "Upgrades and reboots" in `docs/runbooks-mac.md` (auto-login, wake settings, Docker at sign-in, Postgres major moves) (#177) |

## Open, in order

1. **Admin album pages load every photo.** The public page pages at 60
   (#176); the admin page is left until the code health thread's
   admin-page auth change (#157) lands, to avoid a conflict.
2. **Dead code**: `trackEmail` in `src/lib/comms/tracked-message.ts`
   has no callers, so `/t/c` and `/t/o` serve nothing today. Wire it up
   or delete it; if wired, those paths need to pass the invite gate and
   tenant rewrites in `src/middleware.ts`.
3. **Postgres versions differ**: the Mac and CI run 16, Cloud SQL runs
   17. Nothing in the schema depends on the difference today; move the
   Mac and CI to 17 together before the cloud goes live (steps in
   `docs/runbooks-mac.md`, "Upgrades and reboots").
4. **Dev-only advisories**: `npm audit` reports vitest's mocker
   (moderate, fixed in vitest 5) and esbuild's Windows dev server (low).
   Neither ships in the production build. Upgrade vitest when it's a
   quiet day; it's a major version.

## Checks that keep these fixed

- `scripts/check-migrations-schema.sh` (CI job "Expand-only migrations")
- `src/lib/treasury/money-races.db.test.ts`, `src/lib/rsvp/capacity.db.test.ts`, `src/lib/auth/one-time-codes.db.test.ts`
- `src/server-actions/access.test.ts`, `src/lib/admin/guard.test.ts`
- `src/lib/http/request-host.test.ts`
- CI step that seeds, backs up and runs the restore drill
- Runbooks: `docs/runbooks-mac.md`, `docs/runbooks-gcp.md`
