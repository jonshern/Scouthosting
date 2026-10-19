#!/usr/bin/env bash
# Restore a Compass backup made by backup.sh.
#
#   scripts/host/restore.sh --drill [BACKUP]     # prove a backup restores; touches nothing live
#   scripts/host/restore.sh --into DB [BACKUP]   # restore into a NEW database named DB
#   scripts/host/restore.sh --replace [BACKUP]   # replace the live database (asks first)
#
# BACKUP is a compass-<timestamp> directory; the newest one in
# $BACKUP_DIR is used when it's left out.
#
# The drill restores into a scratch database, checks the dump checksum,
# compares every table's row count with the manifest, checks every
# Lantern trail (each scout, checked step and entry) against the
# fingerprint the backup recorded, checks the newest migration, unwraps
# every org's data key and reads every trail with the current
# MASTER_KEY, unpacks the uploads archive, then drops the scratch
# database. It exits
# non-zero if any check fails. Run it on a schedule (make host-install
# does, weekly) so a broken backup is found before it is needed.
#
# RESTORE_KEEP_UPLOADS=1 with --replace leaves the uploads folder as it
# is (rollback.sh --with-data uses it: upload names never repeat, so the
# current folder already holds everything the backup's rows point at,
# plus photos added since).

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
# Backups and their scratch copies hold every unit's data: owner-only.
umask 077

usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

MODE="${1:-}"; [ -n "$MODE" ] || usage; shift
TARGET=""
case "$MODE" in
  --drill) TARGET="compass_restore_drill" ;;
  --into) TARGET="${1:-}"; [ -n "$TARGET" ] || usage; shift ;;
  --replace) TARGET="$DB_NAME" ;;
  *) usage ;;
esac
case "$TARGET" in *[!a-zA-Z0-9_]*) die "invalid database name: $TARGET" ;; esac

SRC="${1:-}"
if [ -z "$SRC" ]; then
  SRC="$(ls -1d "$(backup_dir)"/compass-* 2>/dev/null | sort -r | head -n1 || true)"
  [ -n "$SRC" ] || die "no backups in $(backup_dir)"
fi
[ -f "$SRC/db.dump" ] && [ -f "$SRC/manifest.txt" ] || die "$SRC is not a backup (no db.dump/manifest.txt)"
manifest() { grep -E "^$1 " "$SRC/manifest.txt" | head -n1 | cut -d' ' -f2-; }

log "backup: $SRC (made $(manifest created_at) from commit $(manifest git_commit | cut -c1-8))"

FAILED=0
# check <message> <command...>: run the command, record pass or fail.
check() {
  local msg="$1"; shift
  if "$@"; then log "ok    $msg"; else log "FAIL  $msg"; FAILED=1; fi
}
same() { [ "$1" = "$2" ]; }

want="$(manifest db_dump_sha256)"
check "dump checksum matches the manifest" same "$(sha256_file "$SRC/db.dump")" "$want"
if [ -f "$SRC/uploads.tar.gz" ]; then
  check "uploads checksum matches the manifest" \
    same "$(sha256_file "$SRC/uploads.tar.gz")" "$(manifest uploads_sha256)"
fi
[ "$FAILED" = 0 ] || die "backup files are damaged; pick an older backup"

key_now="$(master_key_fingerprint)"
key_then="$(manifest master_key_fingerprint)"
if [ "$key_now" != "$key_then" ]; then
  log "WARNING: MASTER_KEY fingerprint is $key_now, backup was made with $key_then."
  log "         Encrypted roster fields and photos won't be readable unless you set the old key."
fi

db_exists() {
  [ "$(psql_db postgres -At -c "select 1 from pg_database where datname = '$1'")" = "1" ]
}

if [ "$MODE" = "--replace" ]; then
  if [ "${RESTORE_YES:-}" != "1" ]; then
    printf 'Replace the live database %s with %s? Stop Compass first. Type the database name to go on: ' "$TARGET" "$SRC" >&2
    read -r answer
    [ "$answer" = "$TARGET" ] || die "not confirmed"
  fi
  # Keep the current data, renamed, until the restore is verified.
  KEEP_AS="${TARGET}_before_restore_$(date -u +%Y%m%d%H%M%S)"
  log "renaming $TARGET to $KEEP_AS"
  psql_db postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$TARGET' and pid <> pg_backend_pid()" > /dev/null
  psql_db postgres -c "alter database \"$TARGET\" rename to \"$KEEP_AS\""
elif db_exists "$TARGET"; then
  if [ "$MODE" = "--drill" ]; then
    psql_db postgres -c "drop database \"$TARGET\" with (force)"
  else
    die "database $TARGET already exists; pick a new name"
  fi
fi

psql_db postgres -c "create database \"$TARGET\""
if [ "$MODE" = "--drill" ]; then
  trap 'psql_db postgres -c "drop database if exists \"$TARGET\" with (force)" >/dev/null 2>&1 || true' EXIT
fi

log "restoring into $TARGET"
# --exit-on-error: a partial restore must not look like a good one.
do_restore() { pg_run pg_restore -d "$(conn "$TARGET")" --no-owner --no-privileges --exit-on-error < "$SRC/db.dump"; }
check "pg_restore finished without errors" do_restore

counts_match() {
  diff <(sed -n '/^## row counts/,$p' "$SRC/manifest.txt" | tail -n +2) <(table_counts "$TARGET") >&2
}
check "row counts match the manifest for every table" counts_match

want_journey="$(manifest journey_sha256)"
if [ -n "$want_journey" ]; then
  check "every Lantern trail matches the backup ($(journey_summary "$TARGET"))" \
    same "$(journey_fingerprint "$TARGET")" "$want_journey"
fi

last="$(psql_db "$TARGET" -At -c \
  'select migration_name from _prisma_migrations where finished_at is not null order by migration_name desc limit 1')"
check "newest migration is $last" same "$last" "$(manifest last_migration)"

# The key check needs a Prisma client generated for the backup's schema.
# The live slot has one (deploy.sh runs npm ci and prisma generate
# there); this checkout's may be stale after a git pull, so it is the
# fallback when nothing has been deployed (CI, a fresh Mac).
KEYS_DIR="$ROOT"
live="$(live_slot)"
if [ -n "$live" ] && [ -x "$(slots_dir)/$live/node_modules/.bin/tsx" ] && [ -f "$(slots_dir)/$live/scripts/host/verify-keys.ts" ]; then
  KEYS_DIR="$(slots_dir)/$live"
fi
if [ -d "$KEYS_DIR/node_modules/.bin" ]; then
  verify_keys() {
    (cd "$KEYS_DIR" && VERIFY_DATABASE_URL="${PG_URL%/*}/$TARGET" MASTER_KEY="$(env_get MASTER_KEY)" \
      node_modules/.bin/tsx scripts/host/verify-keys.ts >&2)
  }
  check "MASTER_KEY reads every org's and every trail's encrypted data" verify_keys
else
  log "skip  key check (run npm install first)"
fi

if [ -f "$SRC/uploads.tar.gz" ]; then
  tmp="$(mktemp -d)"
  check "uploads archive unpacks" tar -xzf "$SRC/uploads.tar.gz" -C "$tmp"
  log "      $(find "$tmp" -type f | wc -l | tr -d ' ') uploaded files"
  if [ "$MODE" = "--replace" ] && [ "${RESTORE_KEEP_UPLOADS:-}" = "1" ]; then
    log "      keeping the current uploads folder (RESTORE_KEEP_UPLOADS=1)"
  elif [ "$MODE" = "--replace" ]; then
    dest="$(uploads_dir)"
    if [ -d "$dest" ]; then mv "$dest" "${dest}.before_restore_$(date -u +%Y%m%d%H%M%S)"; fi
    mv "$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n1)" "$dest"
    log "uploads restored to $dest"
  fi
  rm -rf "$tmp"
fi

if [ "$FAILED" != 0 ]; then
  [ "$MODE" = "--replace" ] && log "the old database is still there as $KEEP_AS; see docs/runbooks-mac.md"
  die "restore checks failed"
fi
case "$MODE" in
  --drill) log "drill passed: $SRC restores cleanly" ;;
  --into) log "restored into $TARGET" ;;
  --replace) log "live database replaced; the previous one is kept as $KEEP_AS (drop it once Compass looks right)" ;;
esac
