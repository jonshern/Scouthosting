# Runbooks (GCP)

What to do when something happens in production on Google Cloud (see [gcp-deployment.md](gcp-deployment.md)). Each alert email links to its section here. Commands assume `gcloud` is signed in to the family's GCP project with `gcloud config set run/region us-central1`.

| Situation | Section |
|---|---|
| Shipping a change | [Deploy](#deploy) |
| A deploy made things worse | [Roll back](#roll-back) |
| "Prod is down" alert | [Site is down](#site-is-down) |
| "Core service returning errors" or "Core service slow" alert | [Errors or slow](#errors-or-slow) |
| "Database under pressure" alert | [Database under pressure](#database-under-pressure) |
| "Migration failed" alert | [Migration failed](#migration-failed) |
| Data deleted or corrupted | [Restore the database](#restore-the-database) |
| "Youth-protection refusal" alert | [Youth-protection alert](#youth-protection-alert) |
| A concern about a scout's safety, a leaked account, or exposed data | [Incident response](#incident-response) |
| A secret may be exposed | [Rotate secrets](#rotate-secrets) |
| The public demo is down, stale or misbehaving | [demo.md](demo.md#when-somethings-wrong) |

## Deploy

Deploys are **blue-green**: the new version starts next to the live one, gets checked on its own address, and only then takes the traffic. The old version stays ready to take it back in seconds.

Merging to `main` deploys. The *Deploy* workflow (`scripts/deploy-api.sh`) builds one server image tagged with the commit, then for staging and afterwards production (after your approval, if the `production` environment requires a reviewer):

0. **Back up.** `gcloud sql backups create` takes an on-demand Cloud SQL backup named for the image, so a migration that goes wrong can be [restored](#restore-the-database) from the moment before it.
1. **Migrate.** The `core-migrate-<env>` job runs `prisma migrate deploy` and the row-only grants. The live revision (blue) keeps serving; migrations are expand-only, so it still works on the new schema.
2. **Green.** The image is deployed as a new Cloud Run revision with **no traffic**, tagged `green`, at its own URL (`https://green---core-<env>-…run.app`).
3. **Check green.** `/health` (database reachable) and `/login` must answer on green. If not, the workflow goes red and live traffic never moved.
4. **Flip.** 100% of traffic moves to green, and the live URL is checked again. If that fails, traffic goes straight back to blue.

The previous revision stays deployed (scaled to zero) so a rollback is one traffic change. To redeploy an older commit, open *Actions → Deploy → Run workflow* and pick the commit's branch or tag.

The image never migrates on its own: it only runs `next start`. Wherever it runs, `scripts/migrate.sh` (as the schema owner) must finish before a new version starts. On Google Cloud that is the `core-migrate-<env>` job above; in bluecard's local stack on Jon's Mac it is the `migrate` service, which `scripts/local.sh up` runs before `seed` and `server`. Running `npm run dev` from a checkout is different: apply migrations there with `npx prisma migrate deploy` after pulling.

### Migrations are expand-only

Blue and green share one database, and a rollback returns to blue without touching the schema. So a migration may **add** tables, nullable columns or columns with a default, and indexes. It may not drop, rename or retype anything the running version reads. The *Expand-only migrations* CI check fails a PR whose new migration has `DROP TABLE`, `DROP COLUMN`, a rename, a type change or `SET NOT NULL` (`scripts/check-migrations.sh`), or whose effect on the base schema removes a table, column, key, unique index or enum value, or retypes, tightens or un-defaults a column, however it's written (`scripts/check-migrations-schema.sh`).

To remove or reshape something, take three releases: add the new shape and write to both; switch reads and backfill; then, once no deployed revision uses the old shape, a **contract** migration drops it. Mark that last file with a line `-- contract: <why no live revision needs it>` so the check lets it through, and don't roll back past it.

## Roll back

**Server (seconds):** *Actions → Rollback → Run workflow*, pick the environment, and leave the revision blank to go back one. From a laptop:

```sh
scripts/rollback-api.sh prod            # the revision before the live one
scripts/rollback-api.sh prod <revision> # a specific one (gcloud run revisions list --service core-prod)
```

Nothing is rebuilt and no migration runs. The next merge to `main` deploys a new green and flips to it, so fix forward or revert the commit before merging anything else.

**Waypoint or Lantern website:** Firebase console → Hosting → the app's site (`<project>-waypoint`, `<project>-lantern`) → Release history → the previous release → *Rollback*. Those sites are published from their own repositories.

**Database:** migrations do not roll back on their own. Write a new migration that undoes the change, or [restore](#restore-the-database).

## Site is down

1. Check whether it's everything or one part: open `https://<server-url>/health` (process up and database reachable), then the Waypoint and Lantern websites.
2. No answer at all: look at the service logs (`gcloud run services logs read core-prod --limit 100`). A crash right after a deploy means [roll back](#roll-back).
3. `/health` answers with a database error: the database is the problem. Check Cloud SQL in the console (state, maintenance, CPU, connections). The instance restarts on its own after maintenance. If it's stuck, *Restart* in the console.
4. A website alone is down: check the Firebase Hosting status page and the latest release.
5. Google Cloud status: https://status.cloud.google.com.

## Errors or slow

1. Logs, newest errors first:
   ```sh
   gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="core-prod" AND severity>=ERROR' --limit 50 --freshness 1h
   ```
2. Started with a deploy? [Roll back](#roll-back) first, investigate after.
3. Slow but no errors: look at Cloud SQL *Query insights* for slow queries (anything over 1 second is also logged), and Cloud Run *Metrics* for instance count hitting `max_instances`.
4. A big event is expected: set prod `min_instances = 1` and raise `max_instances` in `infra/terraform.tfvars`, merge, then put them back afterwards.

## Database under pressure

- **CPU or memory** high for 15 minutes: check Query insights for one runaway query first. If it's just load, move `db_tier` from `db-f1-micro` to `db-g1-small` (about $25/month) in `infra/`, merge, and expect a restart of a minute or two.
- **Disk** above 80%: the disk grows by itself (`disk_autoresize`), so this alert means fast growth. Find what is growing (`select relname, pg_size_pretty(pg_total_relation_size(relid)) from pg_statio_user_tables order by 2 desc limit 10;`).

## Migration failed

Nothing is broken for users: the deploy stopped before the new server took traffic, and the old version keeps serving.

1. Read the job's logs: `gcloud run jobs executions list --job core-migrate-prod --limit 3`, then *Logs* on the failed execution in the console.
2. Prisma records each applied migration in `_prisma_migrations`. A failed one is marked failed and blocks later deploys until it is resolved: fix what it left behind, then mark it with `npx prisma migrate resolve --rolled-back <name>` (or `--applied`) run against the migrate database URL through `cloud-sql-proxy`.
3. Fix the migration in a new commit and merge. Never edit a migration that already applied anywhere; add a new folder.

## Restore the database

Backups: daily, kept 14 days, one more before every deploy's migrations (`scripts/deploy-api.sh`), plus point-in-time recovery for the last 7 days. If the instance is ever deleted, a final backup is kept for 30 days.

Off the instance (`infra/backups.tf`): every night at 02:30 Central, `compass_prod` is exported to `gs://<project>-backups/compass_prod/compass_prod.sql.gz` in `us-east1`, and the prod uploads are copied to `uploads/` in the same bucket. Each night's export replaces the last; the older ones stay as versions for 30 days (`gcloud storage ls --all-versions gs://<project>-backups/compass_prod/`). The "Core nightly backup failed" alert fires if the export, its schedule or the uploads copy errors; run it by hand with `gcloud scheduler jobs run core-backup-prod --location us-central1` once the cause is fixed. These copies are what's left if `core-pg` itself is gone: create a new instance (apply), then import the newest export as the owner login (`gcloud sql import sql core-pg <export> --database compass_prod --user compass_prod`) and copy `uploads/` back into the uploads bucket. Uploads and every roster name in the export need the same `MASTER_KEY`, which lives in Secret Manager, not in the bucket.

**Prefer repairing from a copy over replacing the live database**, so nothing written since the accident is lost:

1. Make a copy as it was just before the accident (times in UTC):
   ```sh
   gcloud sql instances clone core-pg core-pg-restore --point-in-time '2026-11-14T14:05:00Z'
   ```
2. Copy the damaged rows or tables back (Cloud SQL Studio in the console works for small fixes; `pg_dump --table` from the clone and `psql` into prod for larger ones, run through `cloud-sql-proxy`).
3. Delete the copy when done: `gcloud sql instances delete core-pg-restore` (it costs about the same as the main database while it exists).

To replace the whole database instead, restore a backup onto the live instance (console → Cloud SQL → Backups → *Restore*). This overwrites everything written since that backup.

### Monthly restore drill

The Mac drills its backups every Sunday; in the cloud, do this on the first of the month (about 15 minutes, a few cents). It proves both kinds of backup restore: the clone comes from Cloud SQL's own backups and logs, and the export is imported into it.

```sh
P=<project-id>
gcloud sql instances clone core-pg core-pg-drill                     # from point-in-time logs
SA=$(gcloud sql instances describe core-pg-drill --format 'value(serviceAccountEmailAddress)')
gcloud storage buckets add-iam-policy-binding gs://$P-backups --member "serviceAccount:$SA" --role roles/storage.objectViewer
gcloud sql databases create compass_drill --instance core-pg-drill
gcloud sql import sql core-pg-drill gs://$P-backups/compass_prod/compass_prod.sql.gz --database compass_drill --user compass_prod
```

In Cloud SQL Studio on `core-pg-drill`, run the same count in `compass_prod` (the clone) and `compass_drill` (the export) and compare: `select (select count(*) from "Org") orgs, (select count(*) from "Member") members, (select count(*) from "User") users, (select count(*) from "JourneyProgress") steps;`. The export is up to a day older, so it may be a little behind, never ahead. Then clean up:

```sh
gcloud storage buckets remove-iam-policy-binding gs://$P-backups --member "serviceAccount:$SA" --role roles/storage.objectViewer
gcloud sql instances delete core-pg-drill
```

## Youth-protection alert

This alert waits for the database backstop that is still to be built (a trigger that refuses a message to a scout with no guardian of that scout on it). Until then it never fires; Compass enforces two-deep messaging in the server.

Once the trigger exists, the alert means the server let such a message through to the database, which refused it:

1. Nothing was sent: the database rolled the message back.
2. Find the refusal: Logs Explorer, `resource.type="cloudsql_database" AND textPayload:"youth protection:"`. Note the time.
3. Find the request that caused it: server logs within the same second.
4. If it was a bug, fix it, and add a test that would have caught it.
5. If it looks deliberate, treat it as an [incident](#incident-response): remove the account's roles in the organization's admin pages, and tell the scoutmaster.

## Someone lost their passkey

A passkey lives on the person's phone or laptop (or their Apple, Google or password-manager sync). If they lose it:

1. **They have another way in.** Password plus an authenticator code or backup code, Google/Apple sign-in, or another passkey. They sign in and remove the lost one on their account's Security page. Nothing for you to do.
2. **A leader or admin whose only second step was that passkey.** They can still enter their password, but sign-in stops at the second step. Confirm it's really them (a call, or a known co-leader vouching), then remove their passkeys so the next sign-in sends them to set up a new second step:

   ```sql
   DELETE FROM "Passkey" WHERE "userId" = (SELECT id FROM "User" WHERE email = 'leader@example.org');
   ```

   Note it in the audit trail of the incident (who asked, who confirmed). If the device may have been stolen rather than lost, also delete their `Session` rows and have them change their password.
3. **Passkeys stopped working for everyone on one address.** Passkeys belong to a site name: the apex (shared by every unit subdomain), each custom domain, or a `PASSKEY_EXTRA_HOSTS` entry. Changing `APEX_HOST` or a unit's custom domain strands the passkeys made on the old name. People sign in another way and add a new passkey; there's no way to move them.

## Incident response

Any concern about a scout's safety comes first, before any technical work:

- **Immediate danger: call 911.**
- Suspected abuse or a youth-protection violation: report it to the local council Scout Executive and to the Scouts First Helpline, **1-844-726-8871**, as Scouting America's youth protection policy requires. Keep the evidence; do not delete messages or accounts.

For technical incidents (an account taken over, data seen by the wrong person, a leaked credential):

1. **Contain.** Remove the person's membership in the organization's admin pages, reset their password, and end their sessions (sessions live in the `Session` table; deleting that user's rows signs them out everywhere, including the phone app). Rotate any exposed secret ([below](#rotate-secrets)). If messaging is being abused, pause it by rolling back to a revision without the feature or setting `max_instances = 0` on the server as a last resort.
2. **Preserve.** Logs are kept 90 days. Export the relevant window before then: Logs Explorer → *Download*, or `gcloud logging read ... --format json > incident.json`. Compass's audit log (`/o/<slug>/admin/audit`, and `/super-admin/audit`) and message tables are the record of who did and sent what.
3. **Assess.** Which people and which data? Youth data is roster details (encrypted at rest), guardianships, sign-ups, photos and messages.
4. **Tell people.** Affected families and the scoutmaster, plainly: what happened, what data, what was done. Check whether your state's breach-notification law applies.
5. **Fix and follow up.** Fix the cause, add a test, and write a short note of what happened in `docs/incidents/`.

## Rotate secrets

| Secret | How |
|---|---|
| **`MASTER_KEY` (`core-<env>-master-key`)** | **Never replace it.** It encrypts roster details and photos. Terraform refuses to destroy it. If it is exposed, each organization's data key has to be re-wrapped using its passphrase or recovery code before the old master key goes away (see `CLAUDE.md`, "Per-org encryption"). Plan that as its own change |
| Database logins (`core-<env>-database-url`, `-migrate-database-url`) | `terraform -chdir=infra apply -replace='module.environment["prod"].random_password.db_app'` (or `db_owner`), then redeploy so the server picks up the new version |
| Session and token secrets (`-session-secret`, `-rsvp-secret`, `-unsub-secret`, `-invite-secret`, `-auth-token-secret`, `-perm-slip-secret`) | `terraform -chdir=infra apply -replace='module.environment["prod"].random_id.generated["SESSION_SECRET"]'` (pick the one), then redeploy. A new session secret signs everyone out; a new RSVP, unsubscribe or permission-slip secret breaks links already emailed |
| Scheduler token (`-tasks-token`) | Same, with `random_id.generated["TASKS_TOKEN"]`; the scheduler job picks up the new value in the same apply |
| Resend key | Create a new key in Resend, then `printf '%s' "$KEY" \| gcloud secrets versions add core-prod-resend-api-key --data-file=-`, redeploy, and delete the old key in Resend |
| Stripe key and webhook secret (`-stripe-secret-key`, `-stripe-webhook-secret`) | Roll the key (or the endpoint's signing secret) in Stripe, add the new value the same way as the Resend key, redeploy, then expire the old one. Setup is in `docs/billing.md` |
| GitHub → GCP access | Nothing to rotate: there are no stored keys. To cut it off, remove the `github-deployer` binding in `infra/bootstrap` or disable the workload identity pool |

Generated secrets also live in the Terraform state bucket, so treat `<project>-tfstate` as sensitive. Only you and the deployer account can read it.
