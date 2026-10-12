#!/usr/bin/env bash
# Back up Compass: the database, uploaded files, and a manifest.
#
#   scripts/host/backup.sh            # make one backup, prune old ones
#   BACKUP_DIR=/path BACKUP_KEEP=30 scripts/host/backup.sh
#
# Writes $BACKUP_DIR/compass-<timestamp>/ (default BACKUP_DIR is
# ../compass-backups next to the checkout):
#   db.dump          pg_dump custom format (restore with restore.sh)
#   uploads.tar.gz   .local-uploads (photos are already encrypted)
#   manifest.txt     git commit, applied migrations, exact row counts,
#                    checksums and a MASTER_KEY fingerprint
#
# The backup does NOT contain MASTER_KEY. Roster names, addresses and
# photos can't be read without it, so keep .env's MASTER_KEY in a
# password manager, not only on this machine.
#
# A backup only counts once it restores: run scripts/host/restore.sh
# --drill (make restore-drill) after changing anything here.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DEST_ROOT="$(backup_dir)"
KEEP="${BACKUP_KEEP:-14}"
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
  echo "database $DB_NAME"
  echo "git_commit $(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "master_key_fingerprint $(master_key_fingerprint)"
  echo "db_dump_sha256 $(sha256_file "$WORK/db.dump")"
  if [ -f "$WORK/uploads.tar.gz" ]; then
    echo "uploads_sha256 $(sha256_file "$WORK/uploads.tar.gz")"
  fi
  echo "last_migration $(psql_db "$DB_NAME" -At -c \
    'select migration_name from _prisma_migrations where finished_at is not null order by migration_name desc limit 1')"
  echo "## row counts"
  table_counts "$DB_NAME"
} > "$WORK/manifest.txt"

mv "$WORK" "$FINAL"
trap - EXIT
log "backup written: $FINAL ($(du -sh "$FINAL" | cut -f1))"

# Keep the newest $KEEP backups.
ls -1d "$DEST_ROOT"/compass-* 2>/dev/null | sort -r | tail -n +"$((KEEP + 1))" | while read -r old; do
  log "pruning $old"
  rm -rf "$old"
done
# Partials older than a day are from runs that died mid-way.
find "$DEST_ROOT" -maxdepth 1 -name '.partial-*' -mtime +1 -exec rm -rf {} + 2>/dev/null || true

echo "$FINAL"
