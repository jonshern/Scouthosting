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
| `parent@example.invalid` | parent in **troop100 + pack100** | ✅ | ✅ | Best for mobile testing. Multi-org. |
| `super@compass.example` | super admin | ✅ | ✅ | Apex super-admin console at `/__super`. |
| `scoutmaster@example.invalid` | admin in troop100 | ✅ | ✅ | Web admin for Sample Troop 100. |
| `cubmaster@example.invalid` | admin in pack100 | ✅ | ✅ | Web admin for Sample Pack 100. |
| `troop-leader@example.invalid` | admin in gstroop100 | ✅ | ✅ | Web admin for Sample Girl Scout Troop 100. |

> **Admin password login on staging:** Production blocks email+password sign-in for admins (must use Google/Apple SSO) — see `lib/auth.js#passwordLoginAllowedForRole`. Staging sets `ALLOW_ADMIN_PASSWORD_LOGIN=1` as a Fly secret to opt out, so all 5 demo accounts work via password there. **Never set this in real production.**

---

## URLs — Staging (Fly.io)

Base host: **`https://scoutingcompass.com`** · App: `compass-staging` (Fly) · Region: `ord` · DNS: Cloudflare (DNS-only, grey cloud)

The Fly hostname `compass-staging.fly.dev` still works but is no longer canonical — `scoutingcompass.com` is the staging domain (wildcard cert via Fly + Let's Encrypt DNS-01).

### Marketing / cross-tenant

| Surface | URL |
|---|---|
| Marketing site | <https://scoutingcompass.com/> |
| Sign in | <https://scoutingcompass.com/login.html> |
| Sign up | <https://scoutingcompass.com/signup.html> |
| Pricing | <https://scoutingcompass.com/plans.html> |
| Pitch | <https://scoutingcompass.com/pitch.html> |
| Positioning | <https://scoutingcompass.com/positioning.html> |
| Health | <https://scoutingcompass.com/healthz> |
| API: orgs | <https://scoutingcompass.com/api/orgs> |
| Super-admin | <https://scoutingcompass.com/__super> *(SSO required)* |
| Fly dashboard | <https://fly.io/apps/compass-staging/monitoring> |

### Per-tenant (subdomain wildcards via `*.scoutingcompass.com`)

| Tenant | Public site | Admin |
|---|---|---|
| Sample Troop 100 | <https://troop100.scoutingcompass.com/> | <https://troop100.scoutingcompass.com/admin> |
| Sample Pack 100 | <https://pack100.scoutingcompass.com/> | <https://pack100.scoutingcompass.com/admin> |
| Sample Girl Scout Troop 100 | <https://gstroop100.scoutingcompass.com/> | <https://gstroop100.scoutingcompass.com/admin> |

### DNS records (Cloudflare, all DNS-only / grey cloud)

| Type  | Name              | Content                                       |
|-------|-------------------|-----------------------------------------------|
| A     | `@`               | `66.241.124.237` (Fly shared-v4 IP)           |
| AAAA  | `@`               | `2a09:8280:1::10f:bbc7:0` (Fly v6 IP)         |
| A     | `*`               | `66.241.124.237`                              |
| AAAA  | `*`               | `2a09:8280:1::10f:bbc7:0`                     |
| CNAME | `_acme-challenge` | `scoutingcompass.com.qjm5mmp.flydns.net`      |

**All DNS-only — never flip the apex/wildcard to orange (proxied) without first switching Cloudflare SSL mode to Full (strict) and testing.** Proxying breaks Let's Encrypt HTTP-01 validation and forces the cert to be re-issued via DNS-01.

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
   EXPO_PUBLIC_COMPASS_BASE_URL=https://scoutingcompass.com
   EXPO_PUBLIC_COMPASS_APEX=scoutingcompass.com
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
2. On the Mac, sign in to <https://scoutingcompass.com/login.html> as the same parent (or a different seeded user).
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
