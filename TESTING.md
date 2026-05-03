# Testing reference

Demo accounts, URLs, and the quickest way to exercise each surface.
For workflow gotchas (why some things don't work where), see
[`CLAUDE.md`](./CLAUDE.md).

---

## Demo accounts

All accounts share the password **`compassdemo123`**. Created by
`prisma/seed.js`; idempotent — re-seeding any environment refreshes
them.

| Email | Role | Local | Staging | Notes |
|---|---|---|---|---|
| `parent@example.invalid` | parent in **troop100 + pack100** | ✅ | ✅ | **The only account that works on staging.** Use for mobile testing. Multi-org. |
| `super@compass.example` | super admin | ✅ | ❌ | Apex super-admin console. Staging blocks admin password login (NODE_ENV=production); needs Google/Apple SSO there. |
| `scoutmaster@example.invalid` | admin in troop100 | ✅ | ❌ | Web admin for Sample Troop 100. Local-only for the same reason. |
| `cubmaster@example.invalid` | admin in pack100 | ✅ | ❌ | Web admin for Sample Pack 100. Local-only. |
| `troop-leader@example.invalid` | admin in gstroop100 | ✅ | ❌ | Web admin for Sample Girl Scout Troop 100. Local-only. |

> **Why admins are local-only on staging:** `lib/auth.js#passwordLoginAllowedForRole` rejects email+password sign-in for any user with `admin` or `isSuperAdmin` when `NODE_ENV === "production"`. Staging runs as `NODE_ENV=production` for prod parity. Admins must use Google/Apple SSO once those are configured.

---

## URLs — Staging (Fly.io)

Base host: **`https://compass-staging.fly.dev`** · App: `compass-staging` · Region: `ord`

| Surface | URL |
|---|---|
| Marketing site | <https://compass-staging.fly.dev/> |
| Sign in | <https://compass-staging.fly.dev/login.html> |
| Sign up | <https://compass-staging.fly.dev/signup.html> |
| Pricing | <https://compass-staging.fly.dev/plans.html> |
| Pitch | <https://compass-staging.fly.dev/pitch.html> |
| Positioning | <https://compass-staging.fly.dev/positioning.html> |
| Health | <https://compass-staging.fly.dev/healthz> |
| API: orgs | <https://compass-staging.fly.dev/api/orgs> |
| Super-admin | <https://compass-staging.fly.dev/__super> *(SSO required)* |
| Fly dashboard | <https://fly.io/apps/compass-staging/monitoring> |

> **Per-org subdomains don't work on staging** — Fly's free tier has no wildcard DNS, so `troop100.compass-staging.fly.dev` won't route. The mobile app and `/api/v1/*` work fine because they're host-agnostic. For per-org web (admin, public unit pages) keep testing locally.

---

## URLs — Local dev

Base host: **`http://localhost:5050`** (port set in `.env` as `PORT=5050`).
Bring up with `make dev` (after `make bootstrap` once).

| Surface | URL |
|---|---|
| Marketing | <http://localhost:5050/> |
| Sign in | <http://localhost:5050/login.html> |
| Super console | <http://localhost:5050/__super> |
| Sample Troop 100 (public) | <http://troop100.localhost:5050/> |
| Sample Troop 100 admin | <http://troop100.localhost:5050/admin> |
| Sample Pack 100 (public) | <http://pack100.localhost:5050/> |
| Sample Pack 100 admin | <http://pack100.localhost:5050/admin> |
| Sample Girl Scout Troop (public) | <http://gstroop100.localhost:5050/> |
| Sample Girl Scout Troop admin | <http://gstroop100.localhost:5050/admin> |

`*.localhost` resolves automatically on macOS — no `/etc/hosts` edits needed.

---

## Mobile (Expo Go on a phone)

### One-time

1. Install **Expo Go** from the App Store on the phone (free, no Apple Developer account, no plug-in).
2. Phone must be on the same Wi-Fi as the Mac.
3. Confirm `mobile/.env` exists (gitignored) with:
   ```
   EXPO_PUBLIC_COMPASS_BASE_URL=https://compass-staging.fly.dev
   EXPO_PUBLIC_COMPASS_APEX=compass-staging.fly.dev
   ```

### Daily

```bash
make mobile          # starts Metro on :8081, prints QR
```

Scan QR with phone's **Camera app** → tap notification → Expo Go opens. First load ~30 s, then JS hot-reloads in <2 s.

### Sign in

Inside the app: tap **Sign in** → in-app browser → email **`parent@example.invalid`** / password **`compassdemo123`** → app lands in Sample Troop 100.

### End-to-end message test

1. Phone is signed in as `parent@example.invalid` and viewing a troop100 chat channel.
2. On the Mac, sign in to <https://compass-staging.fly.dev/login.html> as the same parent (or a different seeded user — but parent is the only one that works on staging).
3. Send a message in the same channel from the web.
4. Phone polls every ~5–10 s; the message appears.

(Sub-second SSE replacement is on the roadmap as PR D2.)

### Common breaks

| Symptom | Cause / fix |
|---|---|
| QR doesn't open Expo Go | Apple removed Expo Go's QR scanner. Use the Camera app instead — tap the notification banner. |
| "Network error" on sign-in | `mobile/.env` is missing or has the wrong URL. Restart Metro after editing — env vars are baked in at bundle time. |
| "Installed Expo Go is SDK X, project is SDK Y" | Project SDK is behind Expo Go's. Run `cd mobile && npm install expo@~<sdk>.0.0 && npx expo install --fix` to align. |
| Babel preset error in Metro | `babel-preset-expo` missing from devDeps. `cd mobile && npm install --save-dev babel-preset-expo@~<sdk>.0.0`. |
| Bundle download times out | Mac's firewall is blocking 8081. System Settings → Network → Firewall → allow incoming for Node. |
| Phone says it can't reach the server | Phone is on a different Wi-Fi than the Mac. Same network is required for `make mobile`. |

---

## Quick commands

```bash
# Local
make bootstrap         # first-time install + Postgres + migrate + seed
make dev               # foreground; node --watch hot-reloads
make redeploy          # pull + wipe DB + reseed + restart + e2e
make redeploy QUICK=1  # same minus pull/install
make e2e               # 19 demo-data smoke tests
make test              # unit + integration vitest

# Staging
make staging-deploy    # fly deploy from current main
make staging-seed      # node prisma/seed.js inside the live container
make staging-logs      # fly logs (real time)
make staging-shell     # interactive shell in the running app

# Mobile
make mobile            # Expo Metro server (:8081, QR)
make mobile-build      # EAS cloud build (PROFILE=development|preview|production, PLATFORM=ios|android|all)

# Help
make help              # everything visible
```
