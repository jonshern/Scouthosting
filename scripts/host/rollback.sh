#!/usr/bin/env bash
# Flip the switch back to the other slot: the build that was live before
# the last deploy. Instant, nothing rebuilt. Refuses if that slot isn't
# healthy (it's restarted once first if it stopped).
#
#   scripts/host/rollback.sh               # code only (make rollback)
#   scripts/host/rollback.sh --with-data   # code and database (make rollback DATA=1)
#
# Code only is the normal case: migrations are expand-only, so the
# previous build runs fine on the new schema.
#
# --with-data is for a migration that went wrong (it damaged or deleted
# data). It puts the database back to the backup deploy.sh took right
# before migrating ($SLOTS_DIR/last-deploy names it), then serves the
# previous build:
#   1. a fresh backup of the database as it is now (nothing is lost)
#   2. both slots stop: Compass is down for the minute or two this takes
#   3. restore.sh --replace with that backup; the current database is
#      kept as compass_before_restore_<time> and the uploads stay as
#      they are
#   4. carry-journey.sh copies Lantern trail changes made since the
#      backup (check marks, logs, notes, photos, new scouts) from the
#      kept database into the restored one, so Emmett's progress since
#      the deploy isn't lost. Other changes since then (chat, RSVPs, ...)
#      are only in the kept database.
#   5. the previous slot starts and the switch points at it (or, when
#      the deploy never went live, the slot that stayed live restarts)
# It asks you to type "restore" first; RESTORE_YES=1 skips that.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

WITH_DATA=0
case "${1:-}" in
  "") ;;
  --with-data) WITH_DATA=1 ;;
  *) die "usage: rollback.sh [--with-data]" ;;
esac

LIVE="$(live_slot)"
[ -n "$LIVE" ] || die "no slot is live; run deploy.sh"
PREV="$(other_slot "$LIVE")"

if [ "$WITH_DATA" = 0 ]; then
  PORT_PREV="$(slot_port "$PREV")"
  DIR="$(slots_dir)/$PREV"
  [ -f "$DIR/.next/BUILD_ID" ] || die "$PREV has never been deployed; nothing to roll back to"
  if ! healthy "$PORT_PREV"; then
    log "$PREV isn't answering; starting it"
    job_ctl restart "server-$PREV"
    wait_healthy "$PORT_PREV" || die "$PREV didn't come up healthy; staying on $LIVE"
  fi
  set_live "$PREV"
  log "switched back to $PREV ($(git -C "$DIR" rev-parse --short HEAD)); $LIVE keeps running"
  exit 0
fi

RECORD="$(slots_dir)/last-deploy"
[ -f "$RECORD" ] || die "no deploy record at $RECORD; restore by hand (see 'Restore' in docs/runbooks-mac.md)"
rec() { sed -n "s/^$1 //p" "$RECORD" | head -n1; }
BACKUP="$(rec backup)"
STATUS="$(rec status)"
[ "$STATUS" != "rolled-back" ] || die "the last deploy was already rolled back with its data"
[ -f "$BACKUP/db.dump" ] || die "the deploy's backup $BACKUP is missing"
# Which code serves afterwards: the build from before the deploy. When
# the deploy went live that's the other slot; when it stopped after
# migrating (unhealthy, or a migration failed) it's still the live one.
if [ "$STATUS" = live ] && [ "$(rec to_slot)" = "$LIVE" ]; then
  SERVE="$PREV"; STOP="$LIVE"
elif [ "$STATUS" != live ] && [ "$(rec from_slot)" = "$LIVE" ]; then
  SERVE="$LIVE"; STOP="$PREV"
else
  die "the last deploy record ($STATUS, to $(rec to_slot)) doesn't match the live slot $LIVE; restore by hand (see 'Restore' in docs/runbooks-mac.md)"
fi
DIR="$(slots_dir)/$SERVE"
PORT_SERVE="$(slot_port "$SERVE")"
[ -f "$DIR/.next/BUILD_ID" ] || die "$SERVE has no build to serve"
MIGRATIONS="$(sed -n 's/^migration //p' "$RECORD")"
# A migration that failed part way may have changed data without being recorded as applied.
[ "$STATUS" != migration-failed ] || MIGRATIONS="${MIGRATIONS:+$MIGRATIONS
}(a migration that failed part way)"
if [ -z "$MIGRATIONS" ]; then
  log "the last deploy applied no migrations, so the database doesn't need to go back."
  log "use plain 'make rollback'; to restore a backup anyway, see 'Restore' in docs/runbooks-mac.md"
  exit 1
fi
CUTOFF="$(sed -n 's/^created_at //p' "$BACKUP/manifest.txt")"

log "the last deploy ($(rec at)) applied:"
printf '  %s\n' "$MIGRATIONS" >&2
log "this puts the database back to $BACKUP and serves $SERVE ($(git -C "$DIR" rev-parse --short HEAD))."
log "Compass is down while it runs. Lantern changes since then are carried over; the rest stays in the kept copy."
if [ "${RESTORE_YES:-}" != "1" ]; then
  printf 'Type "restore" to go on: ' >&2
  read -r answer
  [ "$answer" = "restore" ] || die "not confirmed; nothing changed"
fi

log "backing up the database as it is now"
NOW_BACKUP="$("$ROOT/scripts/host/backup.sh" prerestore)" || die "couldn't back up the current database; nothing changed"

log "stopping both slots"
job_ctl stop "server-blue"
job_ctl stop "server-green"

# restore.sh renames the live database to <name>_before_restore_<time>.
before="$(psql_db postgres -At -c "select datname from pg_database where datname like '${DB_NAME}_before_restore_%'" | sort)"
if ! RESTORE_YES=1 RESTORE_KEEP_UPLOADS=1 "$ROOT/scripts/host/restore.sh" --replace "$BACKUP"; then
  log "the restore failed; see 'Restore' in docs/runbooks-mac.md. The database as it was is backed up in $NOW_BACKUP"
  job_ctl start "server-$LIVE"
  die "rollback with data failed"
fi
KEPT="$(comm -13 <(printf '%s\n' "$before") <(psql_db postgres -At -c "select datname from pg_database where datname like '${DB_NAME}_before_restore_%'" | sort) | tail -n1)"

if [ -n "$KEPT" ]; then
  "$ROOT/scripts/host/carry-journey.sh" "$KEPT" "$DB_NAME" "$CUTOFF" ||
    log "WARNING: Lantern changes since $CUTOFF weren't carried over; they're in $KEPT (see 'Roll back' in docs/runbooks-mac.md)"
fi

job_ctl start "server-$SERVE"
wait_healthy "$PORT_SERVE" || die "$SERVE didn't come up healthy on the restored database; see ~/Library/Logs/compass/server-$SERVE.log"
set_live "$SERVE"
sed -i.bak 's/^status .*/status rolled-back/' "$RECORD" && rm -f "$RECORD.bak"
log "rolled back with data: $SERVE serves on the database from $CUTOFF; $STOP stays stopped (its code wants the newer schema)."
log "the database as it was is kept as $KEPT and backed up in $NOW_BACKUP. Drop $KEPT once Compass looks right."
