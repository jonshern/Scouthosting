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

## Open, in order

1. **Production mail silently falls back to the console driver** when the
   Resend key is missing, and the sign-up verification email's result is
   ignored. Families would just never get mail. Fail at boot in
   production, surface send failures.
2. **Broadcast email runs inline in the request.** A large send can time
   out halfway with no record of who got it. `enqueueJob` exists but has
   no callers; move broadcasts onto pg-boss.
3. **Counselor sign-off overwrite race** (`api/v1/scouts/[id]/progress`):
   two counselors saving at once, last write wins silently. Use a version
   check.
4. **Paid sales order cancelled without a reversal.** The ledger keeps
   the money. Reverse the postings on paid → cancelled.
5. **Invite code `maxUses` and MFA code replay** are read-then-write;
   two requests at once can both succeed. Conditional update.
6. **Signed-in slot claim on the web lacks `idempotent: true`** (the
   phone path has it), so a double tap shows an error.
7. **Capacity**: equipment loans aren't checked against quantity; event
   capacity isn't enforced on RSVP; raising a slot's capacity by import
   doesn't promote the waitlist.
8. **Middleware DB lookup on custom domains** has no error handling; a
   database blip turns every custom-domain request into a 500.
9. **Unbounded reads**: nested `take` missing in the v1 chat and photos
   endpoints; album pages unpaginated; no `connection_limit` on the
   Prisma URL.
10. **Dead code**: `trackEmail` in `src/lib/comms/tracked-message.ts`
    has no callers, so `/t/c` and `/t/o` serve nothing today. Wire it up
    or delete it; if wired, those paths need to pass the invite gate and
    tenant rewrites in `src/middleware.ts`.
11. **Dependency and configuration drift**: not yet reviewed.

## Checks that keep these fixed

- `scripts/check-migrations-schema.sh` (CI job "Expand-only migrations")
- `src/lib/treasury/money-races.db.test.ts`
- `src/server-actions/access.test.ts`, `src/lib/admin/guard.test.ts`
- `src/lib/http/request-host.test.ts`
- CI step that seeds, backs up and runs the restore drill
- Runbooks: `docs/runbooks-mac.md`, `docs/runbooks-gcp.md`
