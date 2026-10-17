# Runbooks (host Mac)

Compass runs on Jon's Mac until the family moves to Google Cloud ([runbooks-gcp.md](runbooks-gcp.md) covers that). This page is what keeps it running there: how it is set up, how to deploy and roll back, how backups work, and what to do when the watchdog alerts.

| Situation | Section |
|---|---|
| Setting the Mac up, or moving from `make dev` | [Set up](#set-up) |
| Shipping new code to the Mac | [Deploy](#deploy) |
| A deploy made things worse | [Roll back](#roll-back) |
| `deploy.sh` stopped with an error | [Deploy failed](#deploy-failed) |
| "site has failed its health check" | [Site is down](#site-is-down) |
| "only N GB free" | [Disk full](#disk-full) |
| "no backup in the last 26 hours" or "restore drill failed" | [Backups](#backups) |
| Data deleted or corrupted | [Restore](#restore) |
| The Mac died or is being replaced | [Move to a new Mac](#move-to-a-new-mac) |

## What runs where

Deploys are blue-green, the same shape as the cloud ([gcp-deployment.md](gcp-deployment.md#blue-green-deploys)): two copies of Compass, and a switch in front that sends every request to one of them.

```
families, phones, Waypoint, Summit
        │  :3000 (tailscale serve points here)
   com.compass.switch  (scripts/host/switch.mjs)
        │  live slot, from ../compass-slots/active
   ┌────┴─────┐
 blue :3001  green :3002     each its own checkout + build in ../compass-slots/<slot>
   └────┬─────┘
   Postgres (Docker, compass-postgres) + .local-uploads in this checkout
```

- **Postgres** runs in Docker (`docker compose up -d`, container `compass-postgres`, data in the `compass-pgdata` volume on the boot disk).
- **This checkout** (`/Volumes/Crucial X9/src/Scouthosting-main` today) holds `.env`, the uploads and these scripts. It doesn't serve anything itself.
- **The slots** are git worktrees in `../compass-slots/blue` and `../compass-slots/green`, each running the production build (`next start`) on loopback under launchd (`com.compass.server-blue`, `com.compass.server-green`), restarted if they crash. The slot that isn't live keeps running the previous build, ready for rollback.
- **The switch** (`com.compass.switch`) listens on 3000 and follows `../compass-slots/active` (`blue 3001` or `green 3002`). `curl localhost:3000/__switch` says which slot is live.
- **Scheduled jobs**, also launchd (`scripts/host/install-launchd.sh` creates them all):

  | Job | When | What |
  |---|---|---|
  | `com.compass.cron` | hourly | `POST /api/cron/run` through the switch: newsletters, RSVP nudges, two-deep sweep, retention purges |
  | `com.compass.backup` | 02:30 daily | `scripts/host/backup.sh` |
  | `com.compass.drill` | Sundays 04:00 | `scripts/host/restore.sh --drill` |
  | `com.compass.watchdog` | every 5 min | `scripts/host/watchdog.sh` |

- **Logs**: `~/Library/Logs/compass/<job>.log` (`server-blue.log`, `switch.log`, ...). Compass logs one JSON line per event. Build output: `../compass-slots/<slot>-build.log`.
- **Secrets**: `.env` in this checkout, shared by both slots. `MASTER_KEY` decrypts every roster name, address and photo; **keep a copy in a password manager**, because a backup without it can't be read. Same for `BETTER_AUTH_SECRET` (losing it signs everyone out, nothing worse).

`make dev` is the development server: it compiles pages on first visit, runs no background jobs and no hourly cron, and isn't meant to stay up for days. Families should be on the slots.

## Set up

From this checkout, with Docker Desktop running:

```sh
make bootstrap                 # first time only: .env, deps, Postgres, MASTER_KEY, migrations, seed
```

Add to `.env` (production mode refuses to start without them; the scripts set `NODE_ENV` themselves):

```sh
BETTER_AUTH_SECRET=<openssl rand -hex 32>
APEX_HOST=<the host name families use, e.g. the Mac's *.ts.net name>
```

Stop any `make dev` first (the switch wants port 3000), then:

```sh
make host-install              # launchd: switch, both slots, cron, backup, drill, watchdog
make deploy                    # builds origin/main into blue and points the switch at it
curl -s localhost:3000/health  # {"ok":true,"version":"…","mail":"console"}
```

`"mail":"console"` means email is only written to the server log, nothing reaches families. To send it, add `MAIL_DRIVER=resend`, `RESEND_API_KEY` and `MAIL_FROM` to `.env` and deploy again. A server with `MAIL_DRIVER=resend` and no key refuses to start, so a half-done setup can't drop mail quietly.

`tailscale serve --bg 3000` keeps pointing at the switch; nothing changes for phones.

To let Waypoint's website sign in, add its address to `.env` and deploy again. It must be the exact https origin the browser shows for Waypoint (scheme, host and port), for example the `tailscale serve` address you gave it:

```sh
WEB_SIGNIN_ORIGINS=https://<the Mac's *.ts.net name>:8443
```

Separate several with commas. Plain `http://` addresses are refused in production mode, and nothing but `<origin>/signed-in` can receive a token.

Production mode applies the production rules: leaders and admins must use two-step sign-in, and admin password sign-in is refused unless `ALLOW_ADMIN_PASSWORD_LOGIN=1` (see CLAUDE.md, trap 3). Until Google or Apple sign-in is configured for this host, that flag is how an admin signs in.

For phone alerts, set `ALERT_WEBHOOK` in `.env` to a URL that accepts a POSTed message, for example an [ntfy](https://ntfy.sh) topic URL with the ntfy app on your phone. Without it, alerts are macOS notifications only.

## Deploy

```sh
make deploy                    # newest origin/main
make deploy REF=<ref>          # a tag, branch or commit
```

`scripts/host/deploy.sh` backs up, checks out the code in the idle slot, builds it there while the live slot keeps serving, applies migrations, starts the idle slot and checks `/health` (it must report the new commit) and `/login` on the slot's own port. Then it flips the switch and checks again through it, flipping back if that fails. Nobody sees downtime: in a test, 3,880 requests made during a deploy all succeeded.

Migrations run while the old build is still live, so they must be **expand-only**: add tables, nullable columns or columns with defaults, and indexes; don't drop, rename or retype anything the running code uses. CI enforces it (*Expand-only migrations*); a later release removes what nothing uses any more with a migration marked `-- contract: <why>`.

## Roll back

```sh
make rollback
```

Flips the switch to the other slot, which is still running the build that was live before the last deploy. Instant, nothing rebuilt, and the database needs nothing because migrations were expand-only. Run it again to flip forward.

A *failed* deploy reuses the idle slot, so after one, the slot behind the live one holds the broken build and `make rollback` refuses (the live slot was never touched). The next good deploy restores a rollback target.

## Deploy failed

The live slot keeps serving in every case below; families don't notice.

- **"build failed"**: the last 30 lines of the build are printed; the full log is `../compass-slots/<slot>-build.log`. Fix it on main and deploy again.
- **"a migration failed"**: check `npx prisma migrate status`. If the failed migration made no changes, fix it on main, mark it `npx prisma migrate resolve --rolled-back <name>` and deploy again. If it changed data part way, restore the backup the deploy just made into a copy and repair from it ([Restore](#restore)).
- **"didn't pass /health and /login"**: the new build started but isn't healthy; read `~/Library/Logs/compass/server-<slot>.log`.
- **"flipped back"**: the slot was healthy on its own port but not through the switch. Check `curl localhost:3000/__switch` and `~/Library/Logs/compass/switch.log`.

## Site is down

1. `curl -s localhost:3000/health`. `database_unreachable` means Postgres: is Docker Desktop running? `docker ps` should list `compass-postgres`. Start Docker Desktop, then `docker compose up -d`.
2. No answer at all: is the switch up? `curl -s localhost:3000/__switch`. If not, `tail ~/Library/Logs/compass/switch.log` and `launchctl kickstart -k gui/$(id -u)/com.compass.switch`.
3. The switch answers but the slot doesn't (a 502 page): `curl -s localhost:3001/health` (blue) or `:3002` (green), and `tail -50 ~/Library/Logs/compass/server-<slot>.log`. A missing secret prints `Missing required env var: …` there. `make rollback` moves traffic to the other slot while you look.
4. The watchdog already restarts the switch and the live slot after three failed checks (15 minutes). If it keeps failing, the cause is in steps 1 to 3.

## Disk full

The boot disk filled once (2026-10-11) and stopped Docker. The watchdog warns below 10 GB (`WATCHDOG_MIN_FREE_GB`).

1. `docker system df` shows what Docker holds; `docker system prune` removes stopped containers, unused images and build cache (not volumes, so the database is safe).
2. Never `docker volume prune` or `docker compose down -v`: `compass-pgdata` is the database.
3. Old backups: `backup.sh` keeps the newest 14 (`BACKUP_KEEP`). It refuses to start with under 1 GB free rather than fill the disk.

## Backups

`backup.sh` writes `../compass-backups/compass-<UTC time>/` next to the checkout (on the external drive, away from the Docker volume; `BACKUP_DIR` moves it):

- `db.dump`: the whole database (`pg_dump` custom format)
- `uploads.tar.gz`: uploaded files (already encrypted)
- `manifest.txt`: commit, newest migration, exact row count of every table, checksums, and a fingerprint of the `MASTER_KEY` it needs (never the key)

The weekly drill restores the newest backup into a scratch database (`compass_restore_drill`), checks the checksums, every table's row count against the manifest and the newest migration, decrypts each org's data with the current `MASTER_KEY`, unpacks the uploads, and drops the scratch database. Run it by hand any time with `make restore-drill`.

- **No recent backup**: `tail ~/Library/Logs/compass/backup.log`. Usually Docker was down at 02:30 or the backup disk wasn't mounted. Run `make backup` once things are up.
- **Drill failed**: `make restore-drill` prints which check failed. A key check failure means `.env` has a different `MASTER_KEY` from the one the data was written with; find the right one before anything else, since new data is being written with whatever key is set. Any other failure: try the previous backup (`scripts/host/restore.sh --drill ../compass-backups/compass-<older>`).

A copy that lives on the same Mac doesn't survive the Mac. Copy `compass-backups` somewhere else on a schedule (another drive, or a cloud folder; the dump holds email addresses and other unencrypted fields, so pick a private one).

## Restore

Prefer repairing from a copy over replacing everything, so nothing written since the backup is lost:

```sh
scripts/host/restore.sh --into compass_copy ../compass-backups/compass-<time>
```

Then copy the damaged rows back with `psql`, and `dropdb compass_copy` when done (inside the container: `docker exec -it compass-postgres psql -U compass`).

To replace the live database with a backup:

```sh
for s in blue green; do launchctl bootout gui/$(id -u)/com.compass.server-$s; done
scripts/host/restore.sh --replace ../compass-backups/compass-<time>
for s in blue green; do launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.compass.server-$s.plist; done
```

`--replace` asks you to type the database name, keeps the old database as `compass_before_restore_<time>` (and the old uploads beside the new ones) and runs the same checks as the drill. Drop the old copy once Compass looks right.

## Upgrades and reboots

Compass only runs while you're signed in to the Mac: the launchd jobs are per-user agents. Set the Mac up so a reboot, a power cut or an overnight macOS update brings it back on its own:

- System Settings → Energy (or Battery → Options on a laptop): turn on "Prevent automatic sleeping when the display is off" and "Start up automatically after a power failure".
- System Settings → Users & Groups → "Automatically log in as" your user. FileVault turns this off; with FileVault on, someone has to type the password after every restart, so install macOS updates when you can do that.
- Docker Desktop → Settings → General → "Start Docker Desktop when you sign in". The Postgres container restarts itself once Docker is up.

**Node.** CI, the Dockerfile and this Mac all use the major version in `.nvmrc` (22). `make deploy` refuses to build if the Mac's `node` is a different major, because a `brew upgrade` can quietly move it. To change Node on purpose: change `.nvmrc`, `engines` in `package.json`, the workflows and the Dockerfile in one PR; once it's merged, install that Node on the Mac, run `make host-install` (launchd remembers the folder `node` was in when it was installed) and then `make deploy`. To stay on 22 with Homebrew, use `brew install node@22` and put `$(brew --prefix node@22)/bin` first on your `PATH`.

**Postgres.** The container image is `postgres:16-alpine`; Docker picks up 16.x fixes when the container is recreated (`docker compose pull && make db-up`). A new major (17) can't open a 16 data folder, so it's a move rather than an upgrade: run `scripts/host/backup.sh`, change the image in `docker-compose.yml` and the volume name with it (`compass-pgdata` to `compass-pgdata17`, both places) so 17 starts on an empty folder, `docker compose down` (keeps the old volume), `make db-up db-wait`, then `scripts/host/restore.sh --replace <that backup>` and `make deploy`. The old volume stays until you delete it. Cloud SQL runs 17, so moving to 17 here also matches the cloud.

**macOS.** Major macOS upgrades can reset the Energy and login settings above and ask Docker Desktop for permissions again. After one, open `localhost:3000/health` and check that alerts still reach your phone (`curl -d test "$ALERT_WEBHOOK"` with the URL from `.env`).

## Move to a new Mac

1. On the new Mac: Docker Desktop, Node 22, clone Scouthosting, `make install db-up db-wait`.
2. Copy `.env` from the password manager or the old Mac (same `MASTER_KEY`).
3. `scripts/host/restore.sh --replace <latest backup>`, then `make host-install` and `make deploy`.

## Passkeys on the Mac

Browsers only allow passkeys on `localhost` (and `*.localhost`) or over https. Signing in from the Mac's own browser at `localhost:3000` works with no setup. From a phone over Tailscale, serve Compass over https (`tailscale serve --bg 3000` gives `https://<mac>.<tailnet>.ts.net`) and add that name to `.env`:

```
PASSKEY_EXTRA_HOSTS=<mac>.<tailnet>.ts.net
```

then `make deploy`. Passkeys made on `localhost` don't work on the Tailscale name and the other way round; each is its own site. Lost passkey: see "Someone lost their passkey" in `docs/runbooks-gcp.md` (the SQL is the same against the Mac's database).
