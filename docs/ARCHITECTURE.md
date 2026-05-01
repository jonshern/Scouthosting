# Compass — architecture

A 20-minute orientation. Read this once, then `cd` somewhere
specific.

## What Compass is

Multi-tenant SaaS for volunteer Scout units. Each tenant ("org")
gets a public unit website on a subdomain (`troop12.compass.app`),
an admin app for leaders, a JSON API for the mobile app, and a
private group-chat surface gated on YPT (Youth Protection Training)
two-deep enforcement.

## Top-down picture

```
                 ┌──────────────────────────────┐
                 │  Browser / Expo mobile app   │
                 └──────────────┬───────────────┘
                                │  HTTPS
        ┌───────────────────────┼───────────────────────┐
        │ nginx (TLS, wildcard cert, *.compass.app)     │
        │   • forwards Host header                       │
        │   • SSE-friendly: 1h read, no buffering        │
        └───────────────────────┬───────────────────────┘
                                │
                ┌───────────────▼───────────────┐
                │  Express app  (server/index)   │
                │                                │
                │   ▸ tenant resolver            │
                │   ▸ marketing site (apex)      │
                │   ▸ public unit site (org)     │
                │   ▸ /admin (server/admin)      │
                │   ▸ /api/v1 (server/api)       │
                │   ▸ /__super (super-admin)     │
                │   ▸ /help (in-app support)     │
                └───────────────┬───────────────┘
                                │
                ┌───────────────▼───────────────┐
                │      Postgres 16 + Prisma      │
                │  (one DB, one schema, orgId)   │
                └────────────────────────────────┘
```

## Tenant model

One Postgres database, one schema, every org-scoped table carries an
`orgId`. Tenant resolution happens at the front of the request:

1. `server/index.js` parses `req.hostname` and looks up the org by
   subdomain slug (or `customDomain` for paid units that bring their
   own domain).
2. `req.org` is populated. Apex / `www` requests have `req.org === null`.
3. Every downstream Prisma query filters by `req.org.id`.

The tenant boundary is enforced at the **application layer**. Postgres
Row-Level Security policies are tracked as `[security]` work in the
roadmap — they're a defence-in-depth upgrade, not the primary gate.

## Identity

`User` rows are the auth identity (Lucia 3 sessions, argon2id password
hashing or Google OAuth). `Member` rows are the directory entries
(name, email, patrol, position) — most youth Members don't have an
associated User. A User joins one or more orgs via `OrgMembership`,
which carries the role (`scout` / `parent` / `leader` / `admin`) and
YPT expiration.

`User.isSuperAdmin` (set out of band via `scripts/grant-super-admin.js`)
unlocks `/__super` on the apex.

## Communication

The product's three pillars (Communication, Organization, Security)
mirror the marketing site. Inside the codebase:

- **Group chat** — `lib/chat.js` (channel auto-creation +
  reconciliation), `lib/chatPermissions.js` (post-policy gate),
  `server/api.js` (POST /channels/:id/messages with two-deep guard).
  Realtime fan-out via in-process EventEmitter (`lib/realtime.js`)
  with SSE delivery; `?access_token=` for `EventSource` (can't
  set headers).
- **Newsletters** — `lib/newsletter.js` (compose + render),
  `server/admin.js` (compose UI + scheduler).
- **Broadcasts** — `server/admin.js` (audience picker + per-recipient
  send), `lib/mail.js` (Resend / SMTP / console drivers), `lib/sms.js`
  (Twilio / console drivers). Bounce + complaint webhooks at
  `/api/webhooks/resend` flip `Member.bouncedAt` so future broadcasts
  skip the address.

## Organization

- **Calendar** — RFC 5545 RRULE expansion in `lib/calendar.js`. Events
  carry `startsAt`, optional `endsAt`, optional `rrule`. RSVPs link to
  Member or User; signed RSVP tokens (`lib/rsvpToken.js`) let parents
  RSVP from an email link without an account.
- **Sign-up sheets** — `SignupSlot` + `SlotAssignment` rows on each
  event for "drivers / potluck / gear" coordination.
- **Trip plans** — `TripPlan` + `Meal` + `Ingredient` + shopping list
  derivation in `lib/shoppingList.js`.
- **Treasurer** — `Reimbursement` model with status flow + Stripe-
  collected dues. Money writes gated on TREASURER scope (see
  `lib/permissions.js`).

## Security

- **YPT two-deep** — every channel write goes through
  `assertChannelTwoDeep` in `lib/chat.js`. A drop below threshold
  auto-suspends; the audit log records why; reactivation requires a
  passing check.
- **CSRF** — `lib/csrf.js` double-submit cookie + same-origin form
  posts. The middleware auto-injects the hidden `<input>` into every
  POST form so handlers can't forget.
- **Origin auth** — `lib/originAuth.js` rejects cross-origin POSTs
  the user agent didn't initiate.
- **Rate limiting** — `lib/rateLimit.js` token-bucket on signup,
  password reset, search.
- **Honeypot** — `lib/honeypot.js` invisible field on the apex
  signup form.
- **Audit log** — `AuditLog` rows for every leader action, written
  via `recordAudit` in `lib/audit.js`. `super:` prefix for
  super-admin actions.
- **Roles + scopes** — `lib/permissions.js` maps free-form
  `Member.position` strings to scoped capabilities (UNIT_LEADER,
  TREASURER, COMMITTEE_CHAIR, …). `requireScope` middleware lazy-
  loads the linked Member only on routes that need it.
- **Per-org isolation** — every Prisma query filters by `orgId`. The
  storage driver writes uploads under `var/uploads/<orgId>/` so
  cross-tenant fileserver access requires forging a path.

## Data model

`prisma/schema.prisma` is the source of truth. Major shapes:

- **Org** — tenant. UnitType enum (Troop / Pack / Crew / Ship / Post /
  GirlScoutTroop). Carries plan, charter org, slug, custom domain,
  feature flags JSON, suspendedAt for non-payment holds.
- **User / OrgMembership / Session** — auth identity, with multi-org
  membership and Lucia sessions.
- **Member** — directory entry (free-form position + patrol; typed
  via `lib/orgRoles.js` at the UI layer).
- **Event / Rsvp / SignupSlot / SlotAssignment / TripPlan / Meal /
  Ingredient / GearItem** — calendar + outing planning.
- **Channel / ChannelMember / Message / Reaction** — chat. `postPolicy`
  scopes who can post (everyone / members / section / leaders).
- **Album / Photo / Post / PostPhoto / Comment** — gallery + activity
  feed.
- **Newsletter / MailLog** — outbound email queue + delivery log.
- **Reimbursement / Refund** — treasurer + super-admin money.
- **SupportTicket** — inbound triage queue.
- **AuditLog** — append-only operator/leader action log.

## Background work

There's no separate worker process — periodic tasks (channel reconcile,
newsletter scheduler, archive ended event channels) run as setInterval
loops at boot. For multi-instance deploys these would move to a
dedicated cron container; tracked as a `[deploy]` item.

## Logging

All service code uses `lib/log.js` — JSON one-liner in production,
human pretty in dev. Per-namespace children (`logger.child("sms")`)
and per-request context (`req.log = log.with({ requestId, orgSlug })`)
threaded through every middleware so log lines stitch together by
`requestId`.

## Analytics

Server-side, privacy-conscious — `lib/analytics.js`. No third-party
tracker, no IPs, no user agents. Events live in AuditLog rows
prefixed `analytics:` so retention + query story is unified. Whitelist
of event names; unknown names log a warning and drop. `/admin/analytics`
renders 30/90-day rollups per org.

## Mobile app

`mobile/` is an Expo (React Native + TypeScript) app. Targets iOS and
Android from one codebase. Auth via `expo-web-browser` against
`/auth/mobile/begin` on the org's apex; bearer token stored in
`expo-secure-store`. Realtime chat via SSE with `?access_token=`. Push
notifications gated on the `mobile.pushNotifications` feature flag.

## Deployment

`Dockerfile` + `docker-compose.prod.yml` for self-hosted single-host;
same image works on Cloud Run / Fly / ECS. nginx terminates TLS and
forwards `Host` so the tenant resolver picks up the org. `/healthz`
(no DB) for liveness; `/readyz` (DB ping) for readiness. Migrations
run on boot via `prisma migrate deploy` (idempotent, multi-instance
safe).

See `docs/DEPLOY.md` for the full env-var reference + deploy paths.

## Where to look

| Area | File |
| --- | --- |
| Marketing site | `index.html`, `styles.css`, `pitch.html` |
| Public unit site | `server/render.js`, `server/index.js` |
| Admin app | `server/admin.js` |
| JSON API | `server/api.js` |
| Super-admin console | `server/superAdmin.js` |
| Auth + sessions | `lib/auth.js` |
| Chat core | `lib/chat.js`, `lib/chatPermissions.js`, `lib/realtime.js` |
| Calendar | `lib/calendar.js` |
| Mail / SMS drivers | `lib/mail.js`, `lib/sms.js` |
| Storage | `lib/storage.js` |
| Schema | `prisma/schema.prisma` |
| Migrations | `prisma/migrations/` |
| Tests | `tests/*.test.js` (unit), `tests/integration/*.test.js` (need DB) |

Run `npm test` (vitest) — every architectural decision should have a
test. If it doesn't, file a bug.
