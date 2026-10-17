#!/usr/bin/env bash
# The restore drill for Lantern trails, end to end, on a scratch
# database. CI runs it on every PR; on the Mac, run it against a copy,
# never the live database (it refuses unless the database name says
# drill, test or unit, or JOURNEY_DRILL_OK=1):
#
#   DATABASE_URL=postgresql://compass:compass@localhost:5432/compass_journey_drill \
#     MASTER_KEY=$(openssl rand -hex 32) scripts/host/journey-drill.sh
#
# Steps, each of which must pass:
#   1. seed a family whose scout Emmett has check marks, logs, a note and a photo
#   2. back up (backup.sh) and run the normal drill (restore.sh --drill)
#   3. lose Emmett's trail, restore the backup over the database, and
#      check his trail is exactly what it was, photo included
#   4. check a step and log time "after the backup", restore the backup
#      again and carry the newer changes over (what rollback.sh
#      --with-data does), and check both old and new progress are there
#   5. copy the backup off-site encrypted (offsite.sh), fetch it back
#      and drill the fetched copy
#
# The database must already be migrated (npx prisma migrate deploy); npm
# run db:seed first is fine too.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

case "$DB_NAME" in
  *drill*|*test*|*unit*) ;;
  *) [ "${JOURNEY_DRILL_OK:-}" = 1 ] || die "refusing to run the drill on $DB_NAME; point DATABASE_URL at a scratch database" ;;
esac
[ -n "$(env_get MASTER_KEY)" ] || die "set MASTER_KEY (openssl rand -hex 32) so the drill checks the real encryption"

WORK="$(mktemp -d)"
export BACKUP_DIR="${BACKUP_DIR:-$WORK/backups}"
export LOCAL_UPLOADS_DIR="${LOCAL_UPLOADS_DIR:-$WORK/uploads}"
export SLOTS_DIR="$WORK/slots"
export RESTORE_YES=1
tsx() { (cd "$ROOT" && node_modules/.bin/tsx scripts/host/journey-drill.ts "$@"); }
step() { log "== $*"; }

step "1. seed Emmett's trail"
tsx seed
tsx snapshot "$WORK/before.json"

step "2. back up and drill"
BACKUP="$("$ROOT/scripts/host/backup.sh" manual)"
grep -q '^journey_sha256 [0-9a-f]\{64\}$' "$BACKUP/manifest.txt" || die "the backup didn't record a Lantern fingerprint"
"$ROOT/scripts/host/restore.sh" --drill "$BACKUP"

step "3. lose the trail, restore, compare"
tsx lose
rm -rf "$LOCAL_UPLOADS_DIR"
"$ROOT/scripts/host/restore.sh" --replace "$BACKUP"
tsx snapshot "$WORK/after.json"
cmp -s "$WORK/before.json" "$WORK/after.json" || { diff "$WORK/before.json" "$WORK/after.json" >&2 || true; die "Emmett's trail after the restore isn't what was backed up"; }
log "Emmett's trail came back exactly: $(journey_summary "$DB_NAME")"

step "4. restore over newer progress and carry it across"
tsx change
CUTOFF="$(sed -n 's/^created_at //p' "$BACKUP/manifest.txt")"
before_dbs="$(psql_db postgres -At -c "select datname from pg_database where datname like '${DB_NAME}_before_restore_%'" | sort)"
RESTORE_KEEP_UPLOADS=1 "$ROOT/scripts/host/restore.sh" --replace "$BACKUP"
KEPT="$(comm -13 <(printf '%s\n' "$before_dbs") <(psql_db postgres -At -c "select datname from pg_database where datname like '${DB_NAME}_before_restore_%'" | sort) | tail -n1)"
[ -n "$KEPT" ] || die "restore.sh didn't keep the previous database"
"$ROOT/scripts/host/carry-journey.sh" "$KEPT" "$DB_NAME" "$CUTOFF"
tsx check-change
tsx snapshot "$WORK/carried.json"
# Everything from before is still there, plus the new step and log.
node -e '
  const [a, b] = process.argv.slice(1).map((f) => JSON.parse(require("fs").readFileSync(f, "utf8")));
  const missing = Object.keys(a.scout.progress).filter((k) => b.scout.progress[k] !== a.scout.progress[k]);
  const lost = a.entries.filter((e) => !b.entries.some((x) => x.id === e.id && x.text === e.text));
  if (missing.length || lost.length || Object.keys(b.photos).length !== Object.keys(a.photos).length) {
    console.error("lost after carrying:", { missing, lost: lost.map((e) => e.id) });
    process.exit(1);
  }' "$WORK/before.json" "$WORK/carried.json"
for db in $(psql_db postgres -At -c "select datname from pg_database where datname like '${DB_NAME}_before_restore_%'"); do
  psql_db postgres -c "drop database \"$db\" with (force)"
done

step "5. off-site copy, fetched back and drilled"
OFFSITE_PASSPHRASE="drill-$(openssl rand -hex 8)"
export OFFSITE_DIR="$WORK/offsite" OFFSITE_PASSPHRASE
"$ROOT/scripts/host/offsite.sh" "$BACKUP"
COPY="$(ls "$OFFSITE_DIR"/compass-*.tar.enc)"
rm -rf "$BACKUP"
FETCHED="$("$ROOT/scripts/host/offsite.sh" --fetch "$COPY")"
"$ROOT/scripts/host/restore.sh" --drill "$FETCHED"

rm -rf "$WORK"
log "journey drill passed: a backup brings Emmett's trail back, with photos, and a data rollback keeps newer progress"
