# CLAUDE.md

Notes for future Claude sessions (and humans) working on Compass.
Lists the non-obvious traps — things you can't figure out by reading
the code in 30 seconds — and the way the project actually works in
practice. Keep this lean; if it grows past one screen of any section,
split.

## Stack at a glance

- Node 20+ (host) / Node 22 (Docker) · Express 4 · Prisma 5 · Postgres 16 · Lucia 3 · argon2id
- Mobile: Expo SDK 51 + React Native 0.74 (no eject; uses Expo modules)
- Local infra: docker-compose for Postgres only; the Express server runs as a host Node process
- Production / staging: deployed via Dockerfile (single image runs migrations on boot, then Express)
- Hosts that exist today: **`scoutingcompass.com`** (staging, Fly app `compass-staging`). Wildcard `*.scoutingcompass.com` cert via Let's Encrypt DNS-01, DNS at Cloudflare (DNS-only / grey cloud — never proxy). All three demo tenants reachable as real subdomains: `troop100.`, `pack100.`, `gstroop100.`. The Fly hostname `compass-staging.fly.dev` still resolves but isn't canonical. Production isn't live; cloudbuild.yaml exists but no GCP deploy is wired up.

Run `make help` for the day-to-day commands — there are 10. Internal helpers (db-up, migrate, wipe, etc.) are still callable but hidden.

---

## Traps that have actually bitten this repo

### 1. ~~The Dockerfile COPY list silently lags root-level files~~ (fixed)

**Was**: `Dockerfile` had an explicit `COPY index.html signup.html …` list. Anything you added at the root or in a new top-level dir (a new marketing page, the `demo/` tenant assets, the `admin/` editor JS) silently 404'd in production until someone remembered to edit the COPY list. This bit us four times — `pitch.html`, `tokens.css`, `demo/`, `admin/site-editor/editor.js`.

**Fix**: switched to `COPY . .` driven by `.dockerignore` (commit cd16554-ish). New top-level files / dirs ship automatically. The dev-only stuff (CLAUDE.md, BUGS.md, ROADMAP.md, README.md, TESTING.md, Makefile, docker-compose*, design/, design_handoff_compass/, docs/, email/, infra/, mobile/, scripts/, security/, tests/, .claude, .github, etc.) is excluded by `.dockerignore`.

If you add something the running app needs at request-time, **don't** put it under one of those excluded paths. If you need to exclude something new from the image, add it to `.dockerignore` rather than reverting the Dockerfile to an explicit list.

### 2. `NODE_ENV=production` blocks admin password login (with an opt-in bypass)

`lib/auth.js#passwordLoginAllowedForRole` rejects email+password sign-in for any user who has an `admin` role or `isSuperAdmin=true`, when `NODE_ENV === "production"`. Admins must use Google or Apple SSO in prod. **This applies to staging too** (Fly's `fly.toml` sets `NODE_ENV=production`).

**Escape hatch for staging / QA**: setting `ALLOW_ADMIN_PASSWORD_LOGIN=1` bypasses the SSO requirement. Compass-staging on Fly already has this Fly-secret set, so the four admin demo accounts work there via password. **Never set this in real production** — it defeats the SSO requirement that's the whole point of the check.

Demo accounts available (all password `compassdemo123`):
- `parent@example.invalid` — non-admin in troop100 + pack100. Works everywhere (parents aren't gated).
- `super@`, `scoutmaster@`, `cubmaster@` (Marcus Whitfield), `troop-leader@` — admins. Work locally; work on staging only because `ALLOW_ADMIN_PASSWORD_LOGIN=1` is set there.

The demo **Pack 100** has a fully populated roster you can sign in as for end-to-end testing of the parent-of-youth flow:
- `pack-committee@example.invalid` — Committee Chair (Elena Rodriguez), `role=leader`
- `pack-treasurer@example.invalid` — Treasurer (Priya Patel), `role=leader`
- `den-leader-lion@example.invalid` through `den-leader-arrowoflight@example.invalid` — six Den Leaders, each with `Member.patrol` set to their den so the parents-of-youth audience picks them up
- 49 parent logins, format `<firstname>.<surname>@example.invalid` (e.g. `sarah.pemberton@example.invalid` is Atlas Pemberton's mom in the Lion Den). All are `role=parent`. See `prisma/seed.js#CUB_DEMO` for the full list of cubs and their parents.

All Pack accounts use the same `compassdemo123` password. **None of these `@example.invalid` addresses route real email** — for newsletter / broadcast end-to-end testing, you'll want a separate seed pass with real test inboxes.

### 3. Multi-tenancy = Host header, except for the API

The web layer (admin, public unit pages, login forms) routes by Host header → `req.org`. Either subdomain match (`troop100.compass.app`) or `Org.customDomain` exact match. **The `/api/v1/*` routes don't care about Host** — they take a bearer token, look up the user, and resolve the org from the URL path or token claim. That's why mobile (which talks only to `/api/v1/*` plus `/auth/mobile/begin`) works against a single host with no wildcard DNS.

Recent change (#65 / commits e0f42de + f0316a6): `/auth/mobile/begin` no longer requires `req.org` — works at apex too. The mobile app uses apex for sign-in and discovers the user's orgs via `/api/v1/auth/me`. Keep this in mind: don't re-add an `if (!req.org)` gate to that route without also fixing the mobile flow.

### 4. macOS local-port gotchas

- **Port 5000** is held by Control Center (AirPlay Receiver). Don't try to bind there. Use 5050 (what `.env` defaults to on this Mac).
- **Port 5432** may be taken by another Postgres container. The repo's `docker-compose.yml` declares `5432:5432`; if needed, drop a `docker-compose.override.yml` (gitignored) with `ports: !override [- "5433:5432"]` and update `DATABASE_URL` accordingly.

### 5. `package-lock.json` drift = build break

`npm install` (host) tolerates a stale lock; `npm ci` (used inside the Dockerfile build) does not — it errors and the deploy fails. **Always commit `package-lock.json` alongside `package.json` changes.** This has happened twice in this repo — once with the OpenTelemetry transitive deps (#60 / fixed in 91b135c) and once with Stripe (fixed in d2cafed).

### 6. Demo seed needs ≥ 512 MB RAM

`prisma/seed.js` generates ~12 procedural JPEGs in memory before flushing to disk. Peaks ~300 MB. The 256 MB default Fly machine OOMs mid-pass and the kernel SIGKILLs the seeder. `fly.toml` ships at 512 MB for this reason — don't drop it back to 256 unless you also slim down the photo step.

### 7. `node:http` for cross-host smoke tests, not `fetch`

Node's built-in `fetch` (undici) treats `Host` as a forbidden header and silently overwrites it. So `fetch(url, { headers: { Host: "troop100.localhost" } })` does **not** route to the troop subdomain — it goes to the apex. Anything that needs to hit a specific subdomain on `localhost` must drop down to `node:http`. See `scripts/e2e-demo.test.mjs` for the pattern.

### 8. Fly seeding requires a running machine

`fly.toml` has `auto_stop_machines = "stop"` — staging machines suspend when idle. Running `fly ssh console` against a stopped machine fails with "no started VMs." Either:
- Hit any HTTP endpoint first (`curl https://compass-staging.fly.dev/healthz`) to wake one, then run the seed
- Or use `fly machine start <id>` first

`make staging-seed` doesn't currently auto-wake; if it errors, curl `/healthz` and retry.

### Error tracking is backend-agnostic

`lib/errorTracker.js` emits structured JSON to stdout when a request throws. Every line carries a Cloud Error Reporting `@type` field, so:

- **GCP Cloud Run + Cloud Logging** auto-extracts errors into Cloud Error Reporting at zero config — just deploy.
- **Grafana Cloud / Honeycomb / Datadog** ingest via the existing OTel exporter (`lib/otel.js`). Set `OTEL_EXPORTER_OTLP_ENDPOINT` (and headers if needed) and errors flow there alongside traces.
- **Local dev** prints pretty lines to stderr; same payload shape, no backend required.

PII is scrubbed at the source: `Authorization` / `Cookie` / `Set-Cookie` / `X-API-Key` headers, the entire body on auth routes (`/login`, `/forgot`, `/signup`, `/reset`, `/auth/*`, `/admin/login`), and `password` / `csrf` / `token` keys in any body. Errors carry `release` (`GIT_SHA` env var, set by the Dockerfile/CI) so each deploy is identifiable. Process-level `uncaughtException` + `unhandledRejection` handlers are installed at boot — they log and exit so the supervisor restarts a corrupted process.

### 9. Photos / uploads on Fly are ephemeral

The Fly app runs without a persistent volume. `/app/var/uploads/*` survives until the next restart, then it's gone. Photo metadata in Postgres outlives the bytes — leading to 404s on `/uploads/<filename>` for anything older than the last redeploy. For staging this is fine (re-seed); for production we need either a Fly volume or object storage (Tigris / S3 / GCS).

---

## Workflow patterns that work

### Local dev loop

```
make bootstrap      # first time on a machine
make dev            # foreground; node --watch hot-reloads
# in another terminal
make e2e            # 19 demo-data smoke tests against running server
```

### Reset to known state

```
make redeploy QUICK=1   # wipe DB, reseed, restart, e2e (no git pull)
make redeploy           # same + git pull --ff-only + npm install
```

### Mobile dev loop

```
cp mobile/.env.example mobile/.env    # edit base URL
make mobile                           # Expo Metro; scan QR with Expo Go
```

For testing against staging instead of `localhost`, set `EXPO_PUBLIC_COMPASS_BASE_URL=https://compass-staging.fly.dev` in `mobile/.env` and restart Metro.

### Staging deploy

```
make staging-deploy   # fly deploy --remote-only
make staging-seed     # node prisma/seed.js inside the live container
make staging-logs     # fly logs
make staging-shell    # interactive shell in the running app
```

Migrations run automatically on container boot (`Dockerfile` CMD: `prisma migrate deploy && node server/index.js`).

---

## Background jobs (`lib/jobs.js`)

pg-boss-backed queue, Postgres only — no Redis. `enqueueJob(name, data, opts)` from anywhere; `registerHandler(name, fn)` at module init. Three modes:

- **queued** (prod boot calls `startJobsRuntime()` → pg-boss running): jobs persist to `pgboss.*` tables; the worker pod runs handlers; retries with exponential backoff per `retryLimit`.
- **in-process** (no `DATABASE_URL`, `JOBS_DISABLED=1`, or `NODE_ENV=test`): `enqueueJob` runs the handler synchronously in the calling request. Same observable behaviour, no isolation, no retry.
- **discarded** (no handler registered for that name): logs a warning, drops. By design — a stray enqueue shouldn't fail an admin action.

`JOBS_DISABLED=1` is the pod-level kill switch (mirror of `CRON_DISABLED=1`). On a multi-pod deploy set it on N-1 pods so only one runs the worker side; every pod can still enqueue.

Built-in handler today: `email.send` (wraps `lib/mail.js#send`). Future handlers go beside it in `lib/jobs.js` — keep the registrations at module top-level so they're picked up by both runtime modes.

---

## Things to never do without explicit permission

- Don't push to `main` if the working tree has uncommitted code from a parallel agent (this repo has had two Claude Code sessions running simultaneously — check `git status` and ask before stashing or committing other work).
- Don't `prisma migrate reset` against `compass_test` if you can avoid it — the test DB is isolated specifically so the dev seed survives `npm test`. (`tests/_test-env.js` enforces this; see "Tests" in README.)
- Don't add cloud secrets to `.env` and commit them — `.env` is gitignored, but `fly secrets set <NAME>=<value>` is the only correct way to put secrets on Fly.
- Don't rip out the SSO-only-for-admins check (#2 above) to "make staging work" — add a non-admin user to test against instead (the seed already has `parent@example.invalid` for this).

---

## Messaging delivery — pick the right channel for the job

Compass has three delivery tiers for member communication. Pick by stakes:

| Channel | Latency | Reliability | Use when |
|---|---|---|---|
| **Broadcast email** (`/admin/email`) | Seconds-to-minutes | Mail-server-grade. Bounces tracked, unsubscribe honored, MailLog audit trail. | Time-critical, all-recipient announcements: weather cancellations, schedule changes, trip reminders. |
| **Direct message** (`/admin/members/:id/message`) | Real-time when push works; ≤30 min via the email-reminder cron when push fails | High via the layered fallback, but no single delivery is "guaranteed-instant" because mobile push is "best effort" by Apple/Google. | 1:1 follow-up, coordinating with a single family, conversational threads. |
| **Channel post** (chat) | Real-time when recipients are online | Push at message-send, in-app on next open. No automatic email backstop yet (only DMs get the +30-min reminder). | Group conversation in a patrol/troop/parents channel where the audience is expected to check the app. |

**iOS push is "best effort"** — silent (`content-available`) pushes are throttled aggressively, alert pushes can drop during APNs incidents, and Focus modes silently suppress alerts even when delivered. The DM 30-minute email reminder (`lib/dmReminderCron.js`) is the safety net for that. For genuinely time-critical announcements use broadcast email — its delivery doesn't depend on push at all.

**Don't reach for chat or DM for emergencies.** A "Pack meeting cancelled tonight" message belongs in `/admin/email` to the parents-of-the-relevant-den broadcast group, not as a chat message.

---

## Open follow-ups (per ROADMAP.md, with status as of last session)

- **Mobile org-picker UI** — multi-org users currently default to `profile.orgs[0]` (`AuthContext.tsx:121`). Real picker is the next mobile UI cycle.
- **Mobile SSE consumption** — `ThreadScreen.tsx` polls every ~5–10s today. PR D2 swaps to `react-native-sse` for sub-second updates.
- **Postgres LISTEN/NOTIFY** for cross-process realtime fan-out — PR D3.
- **Push triggers beyond chat** — only `pushChannelMessage` in `server/api.js:919` fires push today. Event RSVPs, announcements, etc. are next.
- **TestFlight pipeline** — PR C3, deferred until Apple Developer enrollment is done.
- **Persistent uploads on Fly** — see trap #9 above.
