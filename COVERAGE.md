# Test Coverage Matrix

Snapshot of feature × test-coverage as of v0.17.0 (97 / 97 E2E specs
passing in 3.6 min). Generated from a walk of `src/app/**` against
`tests/e2e/**`.

Legend:
- **Yes** — write path exercised end-to-end
- **Partial** — render-only smoke, or read-only feature
- **No** — no test exists

---

## Auth & onboarding

| Feature | Path | Status | Spec |
|---|---|---|---|
| Signup (password) | `/signup` | Yes | `auth.spec.ts` |
| Login (password) | `/login` | Yes | `auth.spec.ts` |
| Login → admin redirect | `/login` → `/admin` | Yes | `auth.spec.ts` |
| Login wrong password | `/login` | Yes | `auth.spec.ts` |
| CSRF on login | `/login` | Yes | `auth.spec.ts` |
| Session cookie security | `compass_session` | Yes | `auth.spec.ts` |
| Password change | `/account/password` | Yes | `account-flows.spec.ts` |
| Magic-link / org invite | `/t/o/[token]` | Partial | — |
| MFA setup + verify | `/login/mfa` | No | — |
| Google SSO | `/api/auth/google/*` | No | — |
| Apple SSO | `/api/auth/apple/*` | No | — |
| Mobile in-app auth | `/auth/mobile/begin` | Partial | `auth.spec.ts` |
| Pre-launch invite codes | `/signup` | No | — |

## Marketing site (apex)

| Feature | Path | Status | Spec |
|---|---|---|---|
| Home / hero | `/` | Yes | `marketing.spec.ts` |
| Pricing | `/plans` | Yes | `marketing.spec.ts` |
| Security | `/security` | Yes | `marketing.spec.ts` |
| Pitch | `/pitch` | Yes | `marketing.spec.ts` |
| Positioning | `/positioning` | Yes | `marketing.spec.ts` |
| Coming-soon gate | `/coming-soon` | No | — |
| Org picker | `/select-org` | Partial | — |

## Account

| Feature | Path | Status | Spec |
|---|---|---|---|
| Profile save | `/account/profile` | Yes | `account-flows.spec.ts` |
| Password change | `/account/password` | Yes | `account-flows.spec.ts` |
| API tokens (mint/revoke) | `/account/api-tokens` | Yes | `api-token-flow.spec.ts` |
| Parent: my scouts | `/account/my-scouts` | Yes | `parent-portal.spec.ts` |
| Parent: my stuff | `/account/my-stuff` | Yes | `parent-portal.spec.ts` |
| Security settings | `/account/security` | Partial | `account.spec.ts` |

## Admin: roster

| Feature | Path | Status | Spec |
|---|---|---|---|
| Members list | `/admin/members` | Yes | `members.spec.ts` |
| Add member | `/admin/members` | Yes | `members.spec.ts` |
| Member drawer | `/admin/members?member=…` | Yes | `member-drawer.spec.ts` |
| Soft-delete + restore | `/admin/members?trash=1` | Yes | `members.spec.ts` |
| Search/filter | `/admin/members?q=…` | Yes | `members.spec.ts` |
| Member detail page | `/admin/members/[id]` | Partial | `admin-pages.spec.ts` |
| Roster import (CSV) | `/admin/members/import` | Yes | `roster-import.spec.ts` |
| Roster reports | `/admin/reports/*.csv` | Yes | `roster-reports.spec.ts` |
| Patrols CRUD | `/admin/patrols` | Yes | `crud-coverage.spec.ts` |
| MBC directory | `/admin/merit-badge-counselors` | Partial (read-only) | `admin-pages.spec.ts` |
| Training matrix | `/admin/training` | Partial (read-only) | `admin-pages.spec.ts` |

## Admin: calendar

| Feature | Path | Status | Spec |
|---|---|---|---|
| Events list/create/edit | `/admin/events` | Yes | `crud-coverage-content.spec.ts`, `calendar.spec.ts` |
| Event delete | `/admin/events/[id]` | Yes | `crud-coverage-content.spec.ts` |
| Locations CRUD | `/admin/locations` | Yes | `crud-coverage.spec.ts` |
| Public calendar | `/o/[slug]/calendar` | Yes | `calendar.spec.ts` |
| iCal feed | `/o/[slug]/calendar.ical` | Yes | `calendar.spec.ts` |
| Public RSVP | `/rsvp/[token]` | Partial | `public-tokens.spec.ts` |
| Slot signups | `/calendar` (slots) | Partial | `slot-signup.spec.ts` |
| Mobile RSVP | `/api/v1/events/[id]/rsvp` | Yes | `event-rsvp-mobile.spec.ts` |
| Permission slips | `/admin/events/[id]/permission-slips` | Partial | `admin-pages.spec.ts` |
| Permission slip sign | `/permission-slip/[token]` | No | — |

## Admin: communications

| Feature | Path | Status | Spec |
|---|---|---|---|
| Posts CRUD (incl. delete) | `/admin/posts` | Yes | `crud-coverage-content.spec.ts`, `posts.spec.ts` |
| Announcements (CR + delete) | `/admin/announcements` | Yes | `crud-coverage-content.spec.ts` |
| Newsletters list | `/admin/newsletters` | Yes | `newsletters.spec.ts` |
| Newsletter schedule | `/admin/newsletters/schedule` | Yes | `crud-coverage-misc.spec.ts` |
| Group email (broadcast) | `/admin/email` | Yes | `email.spec.ts` |
| Email non-leader gate | `/admin/email` | Yes | `email.spec.ts` |
| Channels admin | `/admin/channels` | Yes | `chat.spec.ts` |
| Chat (public) | `/o/[slug]/chat` | Yes | `chat.spec.ts` |
| Send chat message | `/api/v1/channels/[id]/messages` | Yes | `chat-write.spec.ts` |
| Chat delivery (cross-user) | — | Yes | `chat-delivery.spec.ts` |
| DMs admin | `/admin/dm` | Yes | `chat.spec.ts` |

## Admin: site editor

| Feature | Path | Status | Spec |
|---|---|---|---|
| Hero editor (simple) | `/admin/site` | Yes | `pages.spec.ts`, `admin-writes.spec.ts` |
| Canvas blocks (simple) | `/admin/site` | Yes | `admin-writes.spec.ts` |
| Advanced 3-column editor | `/admin/site?mode=advanced` | Partial (renders, no E2E click-thru) | — |
| Custom pages CRUD | `/admin/pages` | Yes | `pages.spec.ts` |
| Public custom page | `/o/[slug]/p/[slug]` | Yes | `pages.spec.ts` |
| Photo albums admin | `/admin/photos` | Partial | `photos.spec.ts` |
| Forms list | `/admin/forms` | Yes | `admin-writes.spec.ts` |
| Form CRUD | `/admin/forms/[id]` | Yes | `admin-writes.spec.ts` |
| Surveys create | `/admin/surveys` | Yes | `crud-coverage-misc.spec.ts`, `surveys.spec.ts` |
| Public survey submit | `/o/[slug]/survey/[s]` | Yes | `surveys.spec.ts` |

## Admin: treasury

| Feature | Path | Status | Spec |
|---|---|---|---|
| Treasury overview | `/admin/treasury` | Yes | `admin-pages.spec.ts` |
| Post manual transaction | `/admin/treasury/posting` | Yes | `crud-coverage.spec.ts` |
| Post bulk dues | `/admin/treasury/posting` | Yes | `crud-coverage-treasury-deep.spec.ts` |
| Fund-to-fund transfer | `/admin/treasury/posting` | Yes | `crud-coverage-treasury-deep.spec.ts` |
| Recompute balances | `/admin/treasury` | Yes | `crud-coverage-treasury-deep.spec.ts` |
| Reverse transaction | `/admin/treasury/ledger` | Yes | `crud-coverage-sales.spec.ts` |
| Ledger view + filter | `/admin/treasury/ledger` | Yes | `crud-coverage.spec.ts` |
| Fiscal years CRUD | `/admin/treasury/fiscal-years` | Yes | `crud-coverage.spec.ts` |
| Fiscal-year budget upsert | `/admin/treasury/fiscal-years/[id]` | Yes | `crud-coverage-treasury-deep.spec.ts` |
| Member balances | `/admin/treasury/members/[id]` | Partial | `admin-pages.spec.ts` |
| Account balances | `/admin/treasury/balances` | Partial | `admin-pages.spec.ts` |
| Reconcile (bank import) | `/admin/treasury/reconcile` | No | — |
| Treasury settings (Stripe) | `/admin/treasury/settings` | No | — |

## Admin: sales

| Feature | Path | Status | Spec |
|---|---|---|---|
| Campaign create + edit | `/admin/sales` | Yes | `crud-coverage-sales.spec.ts` |
| Add product to campaign | `/admin/sales/[id]` | Yes | `crud-coverage-sales.spec.ts` |
| Booth sale recording | `/admin/sales/[id]` | Yes | `crud-coverage-sales.spec.ts` |
| Manual order create | `/admin/sales/[id]` | Partial | `sales-and-scoutbook.spec.ts` |
| Refund issue | `/admin/refunds/new` | Yes | `admin-writes.spec.ts` |
| Public seller page | `/sell/[campaignSlug]/[scoutSlug]` | No | — |
| Public buyer page | `/sell/[campaignSlug]` | No | — |
| Campaign CSV export | `/admin/sales/[id]/export.csv` | No | — |

## Admin: equipment

| Feature | Path | Status | Spec |
|---|---|---|---|
| Add equipment item | `/admin/equipment` | Yes | `crud-coverage-equipment.spec.ts` |
| Loan out | `/admin/equipment` | Yes | `crud-coverage-equipment.spec.ts` |
| Mark returned | `/admin/equipment` | Yes | `crud-coverage-equipment.spec.ts` |
| Loan history | `/admin/equipment/loans` | Yes | `crud-coverage-equipment.spec.ts` |
| Trips | `/admin/trips` | Partial | `admin-pages.spec.ts` |
| Car rides | `/admin/car-rides` | Partial | `admin-pages.spec.ts` |

## Admin: settings

| Feature | Path | Status | Spec |
|---|---|---|---|
| Custom domain set/disconnect | `/admin/domain` | Yes | `admin-writes.spec.ts` |
| Audit log | `/admin/audit` | Partial | `admin-pages.spec.ts` |
| Org security | `/admin/security` | Partial | `admin-pages.spec.ts` |
| Reports hub | `/admin/reports` | Yes | `roster-reports.spec.ts` |
| Scoutbook | `/admin/scoutbook` | Partial | `sales-and-scoutbook.spec.ts` |
| Reimbursements (read-only status) | `/admin/reimbursements` | Partial | `admin-pages.spec.ts` |
| Eagle / OA / CoH tracking | `/admin/{eagle,oa,coh}` | Partial | `admin-pages.spec.ts` |

## Public unit site

| Feature | Path | Status | Spec |
|---|---|---|---|
| Unit home | `/o/[slug]/` | Yes | `pages.spec.ts` |
| Posts feed | `/o/[slug]/posts` | Yes | `posts.spec.ts` |
| Single post | `/o/[slug]/posts/[id]` | Yes | `posts.spec.ts` |
| Calendar | `/o/[slug]/calendar` | Yes | `calendar.spec.ts` |
| Photo albums | `/o/[slug]/photos` | Yes | `admin-pages.spec.ts` |
| Album detail | `/o/[slug]/photos/[a]` | No | — |
| Custom page | `/o/[slug]/p/[s]` | Yes | `pages.spec.ts` |
| Survey | `/o/[slug]/survey/[s]` | Yes | `surveys.spec.ts` |
| Feedback / roadmap | `/o/[slug]/feedback` | Yes | `feedback.spec.ts` |
| Subdomain rewrite | `troop100.localhost` → `/o/troop100` | Yes | `tenant.spec.ts` |
| Unknown subdomain | `/o/troopXX` | Yes | `tenant.spec.ts` |

## Mobile API (`/api/v1/*`)

| Feature | Path | Status | Spec |
|---|---|---|---|
| Auth ME (whoami) | `/api/v1/auth/me` | Yes | `mobile-api.spec.ts` |
| Mint API token | `/api/v1/auth/token` | Yes | `api-token-flow.spec.ts` |
| Revoke API token | `/api/v1/auth/token/[id]` | Yes | `api-token-flow.spec.ts` |
| Dashboard | `/api/v1/orgs/[slug]/dashboard` | Yes | `admin-pages.spec.ts` |
| Events list | `/api/v1/orgs/[slug]/events` | Yes | `mobile-api.spec.ts` |
| Event RSVP | `/api/v1/events/[id]/rsvp` | Yes | `event-rsvp-mobile.spec.ts` |
| Posts | `/api/v1/orgs/[slug]/posts` | Yes | `mobile-api.spec.ts` |
| Photos | `/api/v1/orgs/[slug]/photos` | Yes | `mobile-api.spec.ts` |
| Channels list | `/api/v1/channels` | Partial | — |
| Channel messages | `/api/v1/channels/[id]/messages` | Yes | `chat-write.spec.ts` |
| Push register/unregister | `/api/v1/push/*` | No | — |
| Bearer-token gating | (any v1 endpoint) | Yes | `mobile-api.spec.ts` |

## Super-admin

| Feature | Path | Status | Spec |
|---|---|---|---|
| Plan change | `/super-admin/orgs/[slug]` | Yes | `super-admin-writes.spec.ts` |
| Suspend / restore | `/super-admin/orgs/[slug]` | Yes | `super-admin-writes.spec.ts` |
| Non-super redirect | `/super-admin` | Yes | `super-admin.spec.ts` |
| Dashboard | `/super-admin` | Partial | `super-admin.spec.ts` |
| Analytics | `/super-admin/analytics` | Partial | `admin-pages.spec.ts` |
| Audit log | `/super-admin/audit` | Partial | `admin-pages.spec.ts` |
| Errors | `/super-admin/errors` | Partial | `admin-pages.spec.ts` |
| Architecture page | `/super-admin/architecture` | No | — |

## Webhooks

| Feature | Path | Status | Spec |
|---|---|---|---|
| Stripe (unconfigured 503) | `/api/webhooks/stripe` | Partial | `webhooks.spec.ts` |
| Resend (unconfigured 503) | `/api/webhooks/resend` | Partial | `webhooks.spec.ts` |
| Treasury Stripe | `/api/webhooks/treasury-stripe` | No | — |

---

## Summary

- ~95 features fully tested (Yes)
- ~65 features render-only (Partial)
- ~20 features untested (No)

**E2E suite: 97 / 97 passing in ~3.6 min.**

## Top demo risks

These are the gaps most likely to embarrass during a live demo:

1. **SSO (Google / Apple)** — no E2E coverage; relies on OAuth round-trip
2. **MFA setup/verify** — `/login/mfa` exists but never exercised
3. **Permission slip signing** — `/permission-slip/[token]` has no test
4. **Public seller flow** — `/sell/[campaignSlug]/[scoutSlug]` untested
5. **Bank import / reconcile** — needs CSV fixture; untested
6. **Stripe webhook live path** — only the 503-when-unset path is tested

Mitigations: avoid SSO + MFA in the demo unless pre-tested with a real
account; pre-generate a permission-slip token and screenshot the
signing UI rather than live-demo it; show campaign admin pages, not
the public buyer flow.
