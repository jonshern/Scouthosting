#!/usr/bin/env bash
# Back up Compass: the database, uploaded files, and a manifest.
#
#   scripts/host/backup.sh [reason]   # make one backup, prune old ones
#   BACKUP_DIR=/path BACKUP_KEEP_DAYS=60 scripts/host/backup.sh
#
# reason is recorded in the manifest: "scheduled" (the 02:30 job, the
# default), "predeploy" (deploy.sh, right before migrations), "manual"
# (make backup) or "prerestore" (rollback.sh --with-data).
#
# Writes $BACKUP_DIR/compass-<timestamp>/ (default BACKUP_DIR is
# ../compass-backups next to the checkout):
#   db.dump          pg_dump custom format (restore with restore.sh)
#   uploads.tar.gz   .local-uploads (photos are already encrypted)
#   manifest.txt     git commit, applied migrations, exact row counts,
#                    checksums, a fingerprint of every Lantern trail and
#                    a MASTER_KEY fingerprint
#
# Keeps every backup from the last BACKUP_KEEP_DAYS days (default 30),
# and always the newest BACKUP_KEEP (default 14) however old, so a Mac
# that was off for a month still has its last good copies. The backup
# the last deploy took (rollback.sh --with-data restores it) is never
# pruned. When OFFSITE_DIR or OFFSITE_URL is set, offsite.sh then copies
# the new backup off this disk.
#
# The backup does NOT contain MASTER_KEY. Roster names, addresses and
# photos can't be read without it, so keep .env's MASTER_KEY in a
# password manager, not only on this machine.
#
# A backup only counts once it restores: run scripts/host/restore.sh
# --drill (make restore-drill) after changing anything here.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
# Backups and their scratch copies hold every unit's data: owner-only.
umask 077

DEST_ROOT="$(backup_dir)"
REASON="${1:-scheduled}"
case "$REASON" in *[!a-z]*) die "reason must be a plain word: $REASON" ;; esac
KEEP="$(env_get BACKUP_KEEP)"; KEEP="${KEEP:-14}"
KEEP_DAYS="$(env_get BACKUP_KEEP_DAYS)"; KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$DEST_ROOT/compass-$STAMP"
WORK="$DEST_ROOT/.partial-$STAMP"

mkdir -p "$DEST_ROOT"
# Refuse when the disk is nearly full: a half-written dump that pushes
# the disk to zero takes the database down with it.
avail_kb="$(df -Pk "$DEST_ROOT" | awk 'NR==2 {print $4}')"
min_kb="${BACKUP_MIN_FREE_KB:-1048576}"
[ "$avail_kb" -ge "$min_kb" ] || die "only $((avail_kb / 1024)) MB free at $DEST_ROOT; need $((min_kb / 1024)) MB"

trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK"

log "dumping database $DB_NAME"
pg_run pg_dump -d "$(conn "$DB_NAME")" -Fc --no-owner --no-privileges > "$WORK/db.dump"
[ -s "$WORK/db.dump" ] || die "pg_dump wrote an empty file"
# A dump that pg_restore can't list is corrupt; catch it now, not on
# the day it's needed.
pg_run pg_restore --list < "$WORK/db.dump" > /dev/null || die "pg_restore can't read the new dump"

UPLOADS="$(uploads_dir)"
if [ -d "$UPLOADS" ]; then
  log "archiving uploads from $UPLOADS"
  tar -czf "$WORK/uploads.tar.gz" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")"
else
  log "no uploads directory at $UPLOADS; skipping"
fi

{
  echo "created_at $STAMP"
  echo "reason $REASON"
  echo "database $DB_NAME"
  echo "git_commit $(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "master_key_fingerprint $(master_key_fingerprint)"
  echo "db_dump_sha256 $(sha256_file "$WORK/db.dump")"
  if [ -f "$WORK/uploads.tar.gz" ]; then
    echo "uploads_sha256 $(sha256_file "$WORK/uploads.tar.gz")"
  fi
  echo "last_migration $(psql_db "$DB_NAME" -At -c \
    'select migration_name from _prisma_migrations where finished_at is not null order by migration_name desc limit 1')"
  echo "journey_sha256 $(journey_fingerprint "$DB_NAME")"
  echo "journey $(journey_summary "$DB_NAME")"
  echo "## row counts"
  table_counts "$DB_NAME"
} > "$WORK/manifest.txt"

mv "$WORK" "$FINAL"
trap - EXIT
log "backup written ($REASON): $FINAL ($(du -sh "$FINAL" | cut -f1)); Lantern: $(sed -n 's/^journey //p' "$FINAL/manifest.txt")"

# Prune: past the newest $KEEP, anything older than $KEEP_DAYS days,
# except the rollback point the last deploy recorded.
CUTOFF="compass-$(utc_stamp_days_ago "$KEEP_DAYS")"
PINNED="$(sed -n 's/^backup //p' "$(slots_dir)/last-deploy" 2>/dev/null || true)"
ls -1d "$DEST_ROOT"/compass-* 2>/dev/null | sort -r | tail -n +"$((KEEP + 1))" | while read -r old; do
  [ "$(basename "$old")" \< "$CUTOFF" ] || continue
  [ "$old" != "$PINNED" ] || continue
  log "pruning $old"
  rm -rf "$old"
done
# Partials older than a day are from runs that died mid-way.
find "$DEST_ROOT" -maxdepth 1 -name '.partial-*' -mtime +1 -exec rm -rf {} + 2>/dev/null || true

# The off-Mac copy. A failure there is reported (the watchdog alerts on
# it) but doesn't fail the backup, so a deploy isn't blocked by a cloud
# folder being offline.
if [ -n "$(env_get OFFSITE_DIR)$(env_get OFFSITE_URL)" ]; then
  "$ROOT/scripts/host/offsite.sh" "$FINAL" >&2 || log "WARNING: the off-Mac copy failed; this backup is only on $DEST_ROOT"
fi

echo "$FINAL"
