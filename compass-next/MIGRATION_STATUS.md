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
| `server/template/site.html` | `src/app/o/[slug]/page.tsx` | 🚧 (basic) |
| `admin/` (static editor) | `src/app/o/[slug]/admin/page.tsx` | 🚧 (overview only) |
| `unit-site/`, `mobile/`, `security/` | reused via design tokens | ⬜ |

## Server modules

| Old | New | Status |
|---|---|---|
| `server/index.js` (routing) | `src/middleware.ts` + App Router | 🚧 |
| `server/render.js` (templating) | RSC + Tailwind | 🚧 |
| `server/api.js` (REST) | Server Actions + route handlers | ⬜ |
| `server/admin.js` | `src/app/o/[slug]/admin/...` | 🚧 |
| `server/superAdmin.js` | `src/app/__super/...` | ⬜ |
| `server/provision.js` | Server Action `provisionOrg` | ⬜ |

## lib/* (most of the work)

| Old | New | Status |
|---|---|---|
| `db.js` | `src/lib/db.ts` | ✅ |
| `auth.js` | `src/lib/auth/{lucia,password,role,sessions}.ts` | ✅ |
| `csrf.js` | `src/lib/security/csrf.ts` + middleware | ✅ |
| `honeypot.js` | `src/lib/security/honeypot.ts` | ✅ |
| `rateLimit.js` | `src/lib/security/rate-limit.ts` | ✅ |
| `securityHeaders.js` | `next.config.ts` `headers()` | ✅ |
| `originAuth.js` | `verifyOrigin()` in `src/lib/security/csrf.ts` | ✅ |
| `oauth.js` | `src/lib/auth/oauth.ts` (arctic) | ⬜ |
| `mfa.js` | `src/lib/auth/mfa.ts` | ⬜ |
| `apiToken.js` | `src/lib/auth/api-token.ts` | ⬜ |
| `signedToken.js` | `src/lib/security/signed-token.ts` | ⬜ |
| `inviteToken.js` | `src/lib/security/invite-token.ts` | ⬜ |
| `unsubToken.js` | `src/lib/security/unsub-token.ts` | ⬜ |
| `rsvpToken.js` | `src/lib/security/rsvp-token.ts` | ⬜ |
| `trackingToken.js` | `src/lib/tracking/click-token.ts` | ⬜ |
| `audit.js` | `src/lib/audit.ts` | ⬜ |
| `mail.js` | `src/lib/mail/index.ts` | ⬜ |
| `resendWebhook.js` | `src/app/api/webhooks/resend/route.ts` | ⬜ |
| `sms.js` | `src/lib/sms/index.ts` | ⬜ |
| `push.js` | `src/lib/push/index.ts` | ⬜ |
| `storage.js` | `src/lib/storage/index.ts` | ⬜ |
| `realtime.js` | `src/lib/realtime/bus.ts` (memory + LISTEN/NOTIFY) | ⬜ |
| `jobs.js` | `src/lib/jobs/index.ts` (pg-boss) | ⬜ |
| `otel.js` / `otelBootstrap.js` | `instrumentation.ts` | ⬜ |
| `errorTracker.js` | `src/lib/ops/error-tracker.ts` | ⬜ |
| `analytics.js` / `analyticsTag.js` | `src/lib/tracking/*.ts` | ⬜ |
| `announcementBanner.js` | RSC component | ⬜ |
| `markdown.js` | `src/lib/markdown.ts` | ⬜ |
| `seo.js` | per-route `metadata` exports | ⬜ |
| `videoEmbed.js` | `src/lib/video/embed.ts` | ⬜ |
| `imageGen.js` | `src/lib/storage/image-gen.ts` | ⬜ |
| `featureFlags.js` | `src/lib/features/index.ts` | ⬜ |
| `plans.js` / `plans.constants.js` / `billingState.js` | `src/lib/billing/*.ts` | ⬜ |
| `stripe.js` | `src/lib/billing/stripe.ts` | ⬜ |
| `chat.js` / `chatPermissions.js` | `src/lib/chat/*.ts` | ⬜ |
| `channelAutoAdd.js` | `src/lib/chat/auto-add.ts` | ⬜ |
| `dmReminderCron.js` / `dmDigestCron.js` | pg-boss handlers | ⬜ |
| `newsletter.js` / `newsletterCron.js` | `src/lib/newsletter/*.ts` + cron | ⬜ |
| `calendar.js` | `src/lib/calendar/index.ts` | ⬜ |
| `eventCategories.js` | `src/lib/calendar/categories.ts` | ⬜ |
| `dietary.js` / `shoppingList.js` | `src/lib/trips/*.ts` | ⬜ |
| `dashboard.js` | server-rendered admin overview | 🚧 (basic) |
| `homepageSections.js` | RSC sections under `/o/<slug>/` | ⬜ |
| `marketingWidget.js` / `supportWidget.js` | RSC components | ⬜ |
| `permissions.js` / `orgRoles.js` | `src/lib/auth/permissions.ts` | ⬜ |
| `rosterImport.js` | Server Action + xlsx parser | ⬜ |
| `scoutbook.js` | `src/lib/scoutbook/links.ts` | ⬜ |
| `positionTerms.js` | `src/lib/program/positions.ts` | ⬜ |
| `postReactions.js` | `src/lib/posts/reactions.ts` | ⬜ |
| `trackedMessage.js` | `src/lib/comms/tracked-message.ts` | ⬜ |
| `yptReminder.js` | `src/lib/youth-protection/ypt-reminder.ts` | ⬜ |
| `credits.js` | `src/lib/billing/credits.ts` | ⬜ |
| `log.js` | structured logger via `pino` (TBD) | ⬜ |

## Schema gaps to address before parity

(Independent of the Next.js port — would simplify parity for product 3.)

- Make `User.passwordHash` nullable (Compass already has it nullable
  ✅ — silent-auction does not).
- Add `User.isSuperAdmin` ✅ (Compass already has).
- Standardize `OrgMembership.role` as a string + per-product extension
  (currently a per-product enum).
- Standardize `Plan` as a string + per-product registry.
- Migrate `AuditLog` to a shared shape across products.
