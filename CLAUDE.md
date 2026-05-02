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
- Hosts that exist today: **`compass-staging.fly.dev`** (Fly.io). Production isn't live; cloudbuild.yaml exists but no GCP deploy is wired up.

Run `make help` for the day-to-day commands — there are 10. Internal helpers (db-up, migrate, wipe, etc.) are still callable but hidden.

---

## Traps that have actually bitten this repo

### 1. The Dockerfile COPY list silently lags root-level files

`server/index.js` serves every `*.html / *.css / *.js` at the repo root for the apex/marketing surface. Locally that's free — Express reads from the working tree. **In Docker, only files explicitly listed in the Dockerfile's `COPY` step ship into the image.** Anything you add at the root (`pitch.html`, `tokens.css`, a new marketing page, etc.) **must** be added to `Dockerfile:43-53` or it 404s in production.

Symptom when you forget: site looks "wrong" — fonts default, palette tokens fall back, login button does nothing (because `script.js` 404'd). Hard to diagnose because everything works locally.

If you're adding a new top-level static asset, edit the COPY block. If a CI check ever lands that diffs root-level files vs the Dockerfile, that obsoletes this note.

### 2. `NODE_ENV=production` blocks admin password login

`lib/auth.js#passwordLoginAllowedForRole` rejects email+password sign-in for any user who has an `admin` role or `isSuperAdmin=true`, when `NODE_ENV === "production"`. Admins must use Google or Apple SSO in prod. **This applies to staging too** (Fly's `fly.toml` sets `NODE_ENV=production`).

The 4 original demo users (`super@`, `scoutmaster@`, `cubmaster@`, `troop-leader@`) are all admins → none of them can password-login on staging. The seed adds **`parent@example.invalid`** (password `compassdemo123`) as a non-admin specifically so apex password login is testable in production-shaped environments. Use it for staging mobile-auth testing.

If you ever need to bypass this for debugging, set `NODE_ENV=development` on the running app temporarily — don't rip out the check.

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

## Things to never do without explicit permission

- Don't push to `main` if the working tree has uncommitted code from a parallel agent (this repo has had two Claude Code sessions running simultaneously — check `git status` and ask before stashing or committing other work).
- Don't `prisma migrate reset` against `compass_test` if you can avoid it — the test DB is isolated specifically so the dev seed survives `npm test`. (`tests/_test-env.js` enforces this; see "Tests" in README.)
- Don't add cloud secrets to `.env` and commit them — `.env` is gitignored, but `fly secrets set <NAME>=<value>` is the only correct way to put secrets on Fly.
- Don't rip out the SSO-only-for-admins check (#2 above) to "make staging work" — add a non-admin user to test against instead (the seed already has `parent@example.invalid` for this).

---

## Open follow-ups (per ROADMAP.md, with status as of last session)

- **Mobile org-picker UI** — multi-org users currently default to `profile.orgs[0]` (`AuthContext.tsx:121`). Real picker is the next mobile UI cycle.
- **Mobile SSE consumption** — `ThreadScreen.tsx` polls every ~5–10s today. PR D2 swaps to `react-native-sse` for sub-second updates.
- **Postgres LISTEN/NOTIFY** for cross-process realtime fan-out — PR D3.
- **Push triggers beyond chat** — only `pushChannelMessage` in `server/api.js:919` fires push today. Event RSVPs, announcements, etc. are next.
- **TestFlight pipeline** — PR C3, deferred until Apple Developer enrollment is done.
- **Persistent uploads on Fly** — see trap #9 above.
