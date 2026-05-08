# Compass roadmap

Strategic direction informed by a feature-by-feature audit of TroopWebHost
(https://www.troopwebhost.org/help.aspx?ID=468) cross-referenced against the
current Compass codebase. Full audit lives in `docs/troopwebhost-audit.md`.

The TL;DR of the audit: of TWH's ~470 distinct features, Compass ships ~71
fully and ~74 partially. ~85 of the remaining gaps duplicate Scoutbook /
Internet Advancement and shouldn't be rebuilt. The biggest *non-Scoutbook*
gap is treasury (~100 features). Compass is already ahead of TWH on chat,
mobile, encryption, calendar (RRULE/iCal), email tracking, page CMS, and
trip planning.

## Strategic position

We accept the four takeaways from the audit:

1. **Don't rebuild Scoutbook.** Advancement, blue cards, MB sign-offs, BOR
   workflows, council advancement reports, recharter, NYLT eligibility,
   service stars — all of this is the Scoutbook / Internet Advancement /
   My.Scouting surface. We deep-link out and (later) pull a read-only sync
   for dashboards. We do not become the system of record for advancement.

2. **Treasury is the wedge.** Member subaccounts, dues, online member
   payments, event auto-charges, fund accounting, and bank reconciliation
   are pure greenfield with zero Scoutbook conflict. Finance-heavy units
   (where the treasurer is the loudest voice) are TWH's stickiest cohort
   and our highest-leverage win.

3. **Sales / fundraising is non-Scoutbook territory worth owning.** Popcorn
   and camp-card season drive TWH adoption every fall. Member orders,
   booth sales, prize tracking, and personal sales URLs are all on the
   table once treasury exists to settle into.

4. **Quick wins** that aren't blocked on either of the above — emergency
   contact list per event, electronic permission slips, allergy/birthday/
   shirt-size reports, equipment check-in/out, parent's "My Scouts" view,
   audit log surfacing — all use data we already store.

## Roadmap

### Now (next ~quarter): close the high-leverage non-Scoutbook gaps

Ordered by leverage / unblock-other-work first.

- **Emergency contact list per event** — data exists on Member; surface as
  an event report + leader-pocket export. Zero new schema.
- **Electronic permission slips** — parent signs from email link, signature
  + timestamp + IP recorded against the Event/Member pair. Reuses the
  signed-token machinery from RSVPs/unsubscribes.
- **Permission slip status reports** — needed-by-event, needed-by-scout.
- **My Scouts (parent portal)** — parent sees their linked youths' RSVPs,
  permission status, account balance (once treasury lands), upcoming events.
- **Allergy / dietary report** — `dietaryFlags[]` already on Member.
- **Birthday lists, shirt-size report, scouts-by-age** — trivial reports
  off existing fields.
- **Equipment check-in/out** — promote the Equipment model from
  trip-only assignment into a real loan ledger (member, dueAt, returnedAt).
- **Audit log surface** — schema is already there; build the
  `/super-admin/audit` and per-org `/admin/audit` viewer.
- **Member self-edit of skills/interests** — flip the existing data into
  the My Stuff portal.

### Next: treasury (the wedge)

Scoped as its own track because it's a multi-quarter build. Likely needs
its own design doc before we start.

- **Member subaccounts** — per-Member ledger, opening balance import.
- **Transaction model** — typed entries (deposit, expense, transfer,
  campout, dues, fundraiser proceeds), with audit trail and reversal
  support.
- **Fiscal years + budget templates** — event budgets vs. actuals,
  fundraiser budgets vs. actuals.
- **Auto-charge event participants** — RSVP "yes" + Event.cost → posts a
  transaction against the member subaccount.
- **Online member payments** — Stripe (we already have the SDK
  lazy-loaded) for member→troop payments. Square as a follow-on.
- **Expense reimbursement enhancements** — wire the existing
  `/admin/reimbursements` queue into the transaction ledger.
- **Bank reconciliation + deposits** — match transactions to deposits;
  CSV import from common bank export formats.
- **Account balance reports** — individual account detail, troop account
  balances, fund balances, financial history, budget report.
- **Account balance email** — "send members their balances" is one of
  TWH's stickiest treasurer features.

### Later: sales / fundraising

Builds on treasury. Don't start until treasury's transaction model is
stable.

- Sales campaigns + merchandise catalog + prize tiers.
- Member orders + delivered-quantity tracking.
- Public order page with online payment (reuses the treasury Stripe path).
- Booth sales + booth-location tracking.
- Personal sales URLs + top-seller leaderboard.
- Consolidated order export (for council popcorn submissions).

### Scoutbook integration (parallel, opportunistic)

Not a feature we lead with — but the moment a credible Scoutbook API
opens up (or we get permission to scrape on the user's behalf), we want
the read-only sync ready:

- Pull rank progress, MB progress, awards into local cache.
- Surface Scoutbook-sourced fields on the Member detail page + the
  parent's "My Scouts" view + the Eagle tracker.
- **Never** become the source of truth. Edits go back to Scoutbook.
- Council Advancement Report stays a Scoutbook export — we just remind
  units to run it.

### Other gaps worth tracking but not prioritizing

- Linked sites / family scouting (boy + girl troop linkage) — wait for
  user demand; the model can be retrofitted.
- Tour permit worksheet — BSA replaced these in 2017, low value.
- JTE worksheet — depends on Scoutbook data we don't have yet.
- Recharter — Internet Recharter is My.Scouting's job.
- Forum — our chat + activity feed already covers the use case better.
- Custom CSS / fully custom menus — design system constraint, not a gap.

## What we explicitly aren't doing

- Rebuilding Scoutbook's advancement surface (the 47 advancement
  reports + 27 advancement features). Deep-link out.
- Internet Recharter / council advancement upload. Out of scope.
- Email-relay inbound mailbox. Out of scope.
- Threaded forum. Replaced by chat + activity feed.
- Tour permits.

## Compass differentiators to keep widening

These are ahead of TWH today; they're the reason a unit picks us:

- Per-org field-level encryption (DEK + MASTER_KEY + recovery code)
- TOTP MFA + backup codes
- Native group chat + DMs with two-deep enforcement + leader oversight
- Trip meal planner (recipes, dietary conflict detection, shopping list)
- Carpool / car rides board
- Modern mobile app with push notifications
- iCal feed with full RFC 5545 RRULE recurrence
- GrapesJS visual page CMS with version history
- Resend webhook delivery tracking (opens, clicks, bounces, complaints)
  for both email and SMS
- DM digest + DM reminder cron
- Newsletter with auto-injected upcoming events + recent posts
- API tokens for mobile / integrations
- Multi-tenancy via Host header + custom domain support
