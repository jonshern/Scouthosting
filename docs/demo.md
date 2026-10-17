# The public demo

A prospective unit can try Compass, Waypoint and Lantern before signing up by signing in to a sample troop. The demo is a separate Compass deployment with `DEMO_MODE=1` and its own database; it never shares a database with real units.

| What | Where |
|---|---|
| Front door: pick an account, see the rules | `/demo` |
| What the demo would have emailed or texted | `/demo/outbox` |
| The sample unit | `/o/troop42` (Troop 42, Maple Ridge) |
| Code | `src/lib/demo/` (mode, season data, seed, reset, outbox) |

## What a visitor gets

- **Four shared accounts**, password `TryTheDemo42!`, also one-click on `/demo`:
  - `admin@demo.invalid`: Morgan Ellis, Scoutmaster (unit admin)
  - `leader@demo.invalid`: Priya Shah, Assistant Scoutmaster
  - `counselor@demo.invalid`: Dana Whitfield, merit badge counselor (First Aid, Cooking, Camping)
  - `parent@demo.invalid`: Jordan Rivera, parent of Sam and Theo
- **A season in progress**, dated around the moment of the last reset: weekly meetings, a court of honor and a service project behind, a campout with drivers and a full cook slot with a waitlist ahead, a merit badge day with six stations and volunteer roles (one station full with a waitlist), 25 people in three patrols, scouts from Scout to Life rank, chat in the troop, parents, leaders and event channels, dues, campout fees and popcorn credits in the treasury, and counselor assignments with requirement progress. Everything is in `src/lib/demo/season.ts`; `season.test.ts` checks that every name is invented and every address is `@demo.invalid`.
- **A banner on every page** saying it's a demo, with links to the outbox and back to `/demo`.

## What demo mode changes

| | Normal | `DEMO_MODE=1` |
|---|---|---|
| Email and texts | Resend / Twilio | Stored in `DemoOutboxMessage`, shown on `/demo/outbox` (newest 500 kept) |
| Admin sign-in with a password in production | Refused unless two-step is set up (or Google/Apple) | Allowed, so the shared admin works |
| Two-step sign-in for leaders in production | Required | Not required, and can't be turned on |
| Change password or email | Allowed | Refused with a message |
| Sign up | Allowed | Refused; the demo unit is the only unit |
| `/demo`, `/demo/outbox`, `POST /api/demo/reset` | 404 | On |

Push notifications still go to a visitor's own signed-in phone.

## Reset

The reset deletes every row of every table (except `_prisma_migrations`) and seeds the demo unit again. It runs:

- **at boot** when there's no demo unit (a fresh database seeds itself),
- **every `DEMO_RESET_HOURS`** (default 24): checked hourly by the server process and by each `/api/cron/run` tick,
- **on demand**: the "Reset the demo now" button on `/demo` when signed in as the demo admin, `make demo-reset` from a checkout, or `curl -X POST -H "X-Tasks-Token: $TASKS_TOKEN" https://<demo-host>/api/demo/reset`.

It refuses unless `DEMO_MODE=1` **and** the database holds no real unit (`Org.isDemo = false`), so a demo pointed at the wrong database fails closed. A reset signs everyone out.

## Run it on the Mac

From the Compass checkout, after `make bootstrap` once:

```sh
make demo          # http://localhost:3100/demo
make demo-reset    # back to the starting point
```

`make demo` uses the same Postgres container as `make dev` with a separate `compass_demo` database, so dev data is untouched. It also builds into its own `.next-demo` folder (Next allows one dev server per build folder), so `make dev` and `make demo` run side by side from the same checkout: dev on :3000, demo on :3100. `DEMO_PORT` and `DEMO_DB` move it.

Waypoint against the demo: in bluecard, `scripts/local.sh demo` runs the whole local stack (Compass + Waypoint website) in demo mode; see that repo's README. Lantern has a sample scout mode; see emmett-scouting's app README.

## Run it on Google Cloud

Same image as the real service, a second Cloud Run service and its own database, no code changes:

1. Create a database for it (for example `compass_demo` on the existing Cloud SQL instance) and run `scripts/migrate.sh` against it, like any environment.
2. Deploy the image as a service (for example `core-demo`) with the usual production secrets plus `DEMO_MODE=1`, its own `DATABASE_URL`, and `DISABLE_INVITE_GATE=1`. Use **max instances 1**: the reset guards against overlapping runs within one process only.
3. Point a Cloud Scheduler job at its `/api/cron/run` hourly with the `X-Tasks-Token` header, like the real service, so resets happen even when the service has scaled to zero.
4. Link "Try the demo" on the landing page to `https://<demo-host>/demo`.

Creating the service, database and scheduler job costs money; ask before doing it.

## When something's wrong

| Symptom | Cause and fix |
|---|---|
| `/demo` is a 404 | `DEMO_MODE` isn't `1` on this deployment. |
| "That account didn't sign in" | A reset is running, or a visitor deleted the account. Wait a moment or reset. |
| Log line `demo reset failed … real unit(s)` | The demo is pointed at a database with real units. Stop it and fix `DATABASE_URL`; never set `DEMO_MODE` there. |
| Log line `demo wipe stuck on <table>` | A new foreign key blocks the delete order. The message names the table and the database error; fix the order in `orderForDelete` (`src/lib/demo/reset.ts`). |
| Demo data looks stale | Check the "last reset" line on `/demo`. On Cloud Run, check the scheduler job is calling `/api/cron/run`. |
| A page shows real-looking personal data | Visitors can type anything. Reset now (`make demo-reset` or the API) and it's gone. |
