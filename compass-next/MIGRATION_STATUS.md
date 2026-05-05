# Migration status

Tracks each Express route / lib module → Next.js port. Update on
every PR.

Legend: ✅ done · 🚧 in progress · ⬜ not started

## Pages (root-level HTML → Next.js routes)

| Old | New | Status |
|---|---|---|
| `index.html` | `src/app/(marketing)/page.tsx` | ✅ |
| `signup.html` | `src/app/(marketing)/signup/page.tsx` | ✅ |
| `login.html` | `src/app/(marketing)/login/page.tsx` | ✅ |
| `plans.html` | `src/app/(marketing)/plans/page.tsx` | ✅ |
| `pitch.html` | `src/app/(marketing)/pitch/page.tsx` | ✅ |
| `positioning.html` | `src/app/(marketing)/positioning/page.tsx` | ✅ |
| `security.html` | `src/app/(marketing)/security/page.tsx` | ✅ |
| `server/template/site.html` | `src/app/o/[slug]/page.tsx` | 🚧 (basic shell + hero) |
| `admin/` (static editor) | `src/app/o/[slug]/admin/...` | 🚧 (announcements, events, members, pages, photos, posts, email, site) |
| `unit-site/`, `mobile/`, `security/` | reused via design tokens | ⬜ |

## Server modules

| Old | New | Status |
|---|---|---|
| `server/index.js` (routing) | `src/middleware.ts` + App Router | 🚧 |
| `server/render.js` (templating) | RSC + Tailwind | ✅ (where ported) |
| `server/api.js` (REST) | Server Actions + route handlers | 🚧 (per-feature actions in `src/server-actions/`) |
| `server/admin.js` | `src/app/o/[slug]/admin/...` | 🚧 (most tier-2/3 admin) |
| `server/superAdmin.js` | `src/app/__super/...` | ⬜ |
| `server/provision.js` | Server Action `provisionOrg` | ⬜ |

## lib/* (most of the work)

| Old | New | Status |
|---|---|---|
| `db.js` | `src/lib/db.ts` | ✅ |
| `auth.js` | `src/lib/auth/{lucia,password,role,sessions,policy}.ts` | ✅ |
| `csrf.js` | `src/lib/security/csrf.ts` + middleware | ✅ |
| `honeypot.js` | `src/lib/security/honeypot.ts` | ✅ |
| `rateLimit.js` | `src/lib/security/rate-limit.ts` | ✅ |
| `securityHeaders.js` | `next.config.ts` `headers()` | ✅ |
| `originAuth.js` | `verifyOrigin()` in `src/lib/security/csrf.ts` | ✅ |
| `oauth.js` | `src/lib/auth/oauth.ts` (arctic) | ✅ |
| `mfa.js` | `src/lib/auth/mfa.ts` (+ `mfa-verify.ts`, `mfa-cookie.ts`) | ✅ |
| `apiToken.js` | `src/lib/auth/api-token.ts` | ⬜ |
| `signedToken.js` | `src/lib/security/signed-token.ts` | ✅ |
| `inviteToken.js` | `src/lib/security/invite-token.ts` | ✅ |
| `unsubToken.js` | `src/lib/security/unsub-token.ts` | ✅ |
| `rsvpToken.js` | `src/lib/security/rsvp-token.ts` | ✅ |
| `trackingToken.js` | `src/lib/tracking/click-token.ts` | ⬜ |
| `audit.js` | `src/lib/audit.ts` | ✅ |
| `mail.js` | `src/lib/mail/index.ts` (+ `audience.ts`) — console + Resend drivers | ✅ |
| `resendWebhook.js` | `src/lib/mail/resend-webhook.ts` (lib) + `src/app/api/webhooks/resend/route.ts` (route) | ✅ |
| `sms.js` | `src/lib/sms/index.ts` (console + twilio drivers) | ✅ |
| `push.js` | `src/lib/push/index.ts` | ⬜ |
| `storage.js` | `src/lib/storage/local.ts` (memory + local-disk only) | 🚧 (S3/GCS adapter pending) |
| `realtime.js` | `src/lib/realtime/bus.ts` (in-process EventEmitter; LISTEN/NOTIFY layer pending) | 🚧 |
| `jobs.js` | `src/lib/jobs/{index,registry,handlers}.ts` (pg-boss + in-process fallback) | ✅ (email + sms broadcast handlers) |
| `log.js` | `src/lib/log.ts` | ✅ |
| `otel.js` / `otelBootstrap.js` | `instrumentation.ts` | ⬜ |
| `errorTracker.js` | `src/lib/ops/error-tracker.ts` | ⬜ |
| `analytics.js` / `analyticsTag.js` | `src/lib/tracking/*.ts` | ⬜ |
| `announcementBanner.js` | `src/components/site/AnnouncementBanner.tsx` | ✅ |
| `markdown.js` | `src/lib/markdown.ts` | ✅ |
| `seo.js` | `src/lib/seo.ts` (metaTags + JSON-LD + sitemap + robots) + per-route `metadata` exports | ✅ |
| `videoEmbed.js` | `src/lib/video/embed.ts` | ✅ |
| `imageGen.js` | `src/lib/storage/image-gen.ts` | ✅ |
| `featureFlags.js` | `src/lib/features/index.ts` | ✅ |
| `plans.js` / `plans.constants.js` / `billingState.js` | `src/lib/billing/*.ts` | ⬜ |
| `stripe.js` | `src/lib/billing/stripe.ts` | ⬜ |
| `chat.js` / `chatPermissions.js` | `src/lib/chat/*.ts` | ⬜ |
| `channelAutoAdd.js` | `src/lib/chat/auto-add.ts` | ⬜ |
| `dmReminderCron.js` / `dmDigestCron.js` | pg-boss handlers | ⬜ |
| `newsletter.js` / `newsletterCron.js` | `src/lib/newsletter/*.ts` + cron | ⬜ |
| `calendar.js` | `src/lib/calendar/{ical,recurrence}.ts` | ✅ |
| `eventCategories.js` | `src/lib/calendar/categories.ts` | ✅ |
| `dietary.js` / `shoppingList.js` | `src/lib/trips/*.ts` | ⬜ |
| `dashboard.js` | server-rendered admin overview | 🚧 (basic) |
| `homepageSections.js` | RSC sections under `/o/<slug>/` | ⬜ |
| `marketingWidget.js` / `supportWidget.js` | RSC components | ⬜ |
| `permissions.js` / `orgRoles.js` | `src/lib/auth/permissions.ts` + `src/lib/auth/org-roles.ts` | ✅ |
| `rosterImport.js` | Server Action + xlsx parser | ⬜ |
| `scoutbook.js` | `src/lib/scoutbook/links.ts` | ✅ |
| `positionTerms.js` | `src/lib/program/positions.ts` | ✅ |
| `postReactions.js` | `src/lib/posts/reactions.ts` | ✅ (lib; mutation server action still ⬜) |
| `trackingToken.js` | `src/lib/tracking/click-token.ts` | ✅ |
| `trackedMessage.js` | `src/lib/comms/tracked-message.ts` | ✅ |
| `yptReminder.js` | `src/lib/youth-protection/ypt-reminder.ts` | ⬜ |
| `credits.js` | `src/lib/billing/credits.ts` | ✅ |
| `log.js` | structured logger via `pino` (TBD) | ⬜ |

## Tenancy + supporting libs (new in compass-next)

| New | Notes | Status |
|---|---|---|
| `src/lib/tenancy/resolve.ts` | Host → tenant slug / custom-domain classifier | ✅ |
| `src/lib/validation/{schemas,slug}.ts` | Zod input validation | ✅ |
| `src/lib/env.ts` | Required/optional env wrapper | ✅ |
| `src/lib/auth/policy.ts` | Mirrors `passwordLoginAllowedForRole` from Compass | ✅ |

## Server actions ported

`src/server-actions/`:

- `auth.ts` (login, signup, logout, MFA detour) ✅
- `mfa.ts` (enroll, confirm, verify, disable, regenerate backup codes) ✅
- `announcements.ts` ✅
- `events.ts` ✅
- `rsvp.ts` ✅
- `members.ts` ✅
- `pages.ts` ✅
- `photos.ts` ✅
- `posts.ts` ✅
- `email.ts` ✅
- `slots.ts` (takeSlot + releaseSlotAssignment with capacity + waitlist) ✅

⬜ Not yet ported: post reactions/comments mutation actions, push
device registration, chat channel CRUD, billing checkout/portal,
super-admin actions, mobile API token actions, roster import.

## Open follow-ups (immediate)

1. **Resend webhook + Resend mail driver.** `mail/index.ts` only has
   the console driver today; need Resend transport + the webhook to
   capture bounces/opens/clicks.
2. **Background jobs (pg-boss).** Required before newsletter,
   DM reminder cron, DM digest cron can land.
3. **Token utilities still pending.** `apiToken` (touches DB), and
   `trackingToken` (analytics) — grouped with the mobile-API and
   analytics ports respectively.
4. **Roster import** (xlsx parser server action).
5. **Permissions module + orgRoles.** Needs careful enum→string
   refactor.

## High-blast-radius items (require explicit review before merging)

- **Mobile API at `/api/v1/*`.** The production Expo app talks to this.
  Backwards compatibility is not optional. Plan: keep the Express
  surface live on Fly while the Next.js port is staged — only cut over
  once the Expo client has been switched (and feature-flagged for
  rollback).
- **Chat (`lib/chat.js` + `chatPermissions.js`).** Two-deep guard is
  the highest-stakes piece per project README. Port with full unit
  test coverage of every guard branch.
- **Stripe.** Subscription + Customer Portal + webhook. Webhook
  signature verification + idempotency keys; do not skip.
- **Super-admin (`/__super`).** Apex-only operator UI. Last to port
  per the tier list.
- **Retire `server/index.js`.** Only after parity is proven on
  staging.

## Schema gaps to address before parity

(Independent of the Next.js port — would simplify parity for product 3.)

- Make `User.passwordHash` nullable (Compass already has it nullable
  ✅ — silent-auction does not).
- Add `User.isSuperAdmin` ✅ (Compass already has).
- Standardize `OrgMembership.role` as a string + per-product extension
  (currently a per-product enum).
- Standardize `Plan` as a string + per-product registry.
- Migrate `AuditLog` to a shared shape across products.
