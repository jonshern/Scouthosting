# Compass

**The planning and communication hub for Scout units** — troops, Cub
Scout packs, Venturing crews, Sea Scout ships, Girl Scout troops.

Each unit gets a modern, mobile-first website plus a private member
hub: calendar, photos, forms, group email + SMS broadcast, trip & meal
planning, group chat, posts, member directory, and a CMS leaders can
actually use. Mobile companion app on iOS + Android via Expo.

Scoutbook (Scouting America's official tool) handles advancement;
Compass deep-links into it instead of competing.

## Repo layout

```
src/                 # Next.js app — server components, server
                     # actions, route handlers under app/.
tests/               # Vitest unit tests (src/**/*.test.ts) and
                     # Playwright E2E (tests/e2e/).
prisma/              # Schema + migrations (shared with mobile).
mobile/              # Expo / React Native client. Talks to /api/v1/*.
Dockerfile           # Multi-stage build → port 3000.
docker-compose.yml   # Local Postgres only.
```

## Local dev

Postgres on `:5433` (the gitignored `docker-compose.override.yml`
remaps so the project doesn't collide with another local Postgres):

```bash
docker compose up -d postgres
```

Then at the repo root:

```bash
cp .env.example .env       # edit DATABASE_URL if not 5433
npm install
npx prisma generate
npm run db:deploy          # apply migrations to the dev DB
npx tsx tests/seed.ts      # seed scoutmaster + troop100
npm run dev                # localhost:3000
```

Tenant subdomains work via Chromium's built-in `*.localhost` resolver:
`http://troop100.localhost:3000`. macOS Node's resolver doesn't
auto-route there — relevant only for `node:http` calls in scripts.

Demo sign-in: `scoutmaster@example.invalid` / `AdminPasswordTest123!`.

## Tests

```bash
npm test                   # vitest unit tests
npm run typecheck
npm run test:e2e           # playwright against a prod build
```

## Mobile

```bash
cd mobile
cp .env.example .env       # set EXPO_PUBLIC_COMPASS_BASE_URL
npm install
npm run start              # Expo Metro
```

Mobile signs in via the apex's `/auth/mobile/begin` (in-app browser →
deep-link callback with a bearer token), then talks to `/api/v1/*`.

## Deploying

`Dockerfile` is the runtime. Build it, push to your registry, run on
any orchestrator (Cloud Run, Fly machines, ECS, plain docker compose).
The image runs `prisma migrate deploy` on boot, then `next start`.

Required env at runtime:
- `DATABASE_URL` — Postgres
- `SESSION_SECRET` — 64-hex; signs Lucia sessions
- `APEX_HOST` — apex domain (e.g. `compass.app`)
- `MAIL_DRIVER`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` — for email
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` — for billing
- `STORAGE_DRIVER` (local|s3|gcs) — `S3_BUCKET` etc. when not local
- `EXPO_ACCESS_TOKEN` — for push notifications
- `JOBS_DISABLED=1` on N-1 pods so only one runs the pg-boss worker
- `ALLOW_ADMIN_PASSWORD_LOGIN=1` on staging only — admins MUST use
  Google/Apple SSO in real production

## Architecture

- **Next.js 16 App Router** — server components by default, server
  actions for mutations, route handlers for `/api/v1/*` and webhooks.
- **Lucia 3 + argon2id** for cookie sessions; bearer tokens (`compass_pat_*`)
  for the mobile app, hashed at rest.
- **Multi-tenancy via Host header** — `troop100.compass.app` rewrites
  to `/o/troop100/...` in `src/middleware.ts`. Apex hosts marketing.
- **pg-boss** for background jobs — same Postgres, no Redis. In-process
  fallback when the worker isn't running (tests, dev).
- **Storage facade** — local / S3 / GCS via `STORAGE_DRIVER`. Photo
  uploads, attachments, support-ticket screenshots all go through one
  `put / get / del` surface.
- **YPT two-deep guard** — every chat write goes through
  `assertChannelTwoDeep`; channels with youth and < 2 YPT-current adults
  auto-suspend.

## License

Source-available under terms TBD; the running service is operated by
the authors at `scoutingcompass.com`.
