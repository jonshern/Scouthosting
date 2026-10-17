#!/usr/bin/env bash
# Health watchdog for the Compass host. launchd runs it every 5 minutes.
#
# Checks, and alerts when one fails:
#   - /health answers through the switch (database reachable). Three
#     misses in a row restart the switch and the live slot (a hung
#     process, not just a crashed one; launchd already restarts crashes).
#   - the disk holding Docker's data and the one holding backups have
#     at least WATCHDOG_MIN_FREE_GB free (default 10). A full boot disk
#     stops Postgres.
#   - the newest backup is under 26 hours old.
#   - the last restore drill passed.
#   - the last off-Mac copy worked (when OFFSITE_DIR or OFFSITE_URL is set).
#
# Alerts go to a macOS notification and, when ALERT_WEBHOOK is set in
# .env, a POST of the message text to that URL (an ntfy.sh topic URL
# works and pushes to a phone). One alert per problem per 6 hours, plus
# a "recovered" message when it clears.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PORT="$(switch_port)"
STATE="${WATCHDOG_STATE_DIR:-$HOME/Library/Application Support/compass-watchdog}"
MIN_FREE_GB="$(env_get WATCHDOG_MIN_FREE_GB)"; MIN_FREE_GB="${MIN_FREE_GB:-10}"
WEBHOOK="$(env_get ALERT_WEBHOOK)"
mkdir -p "$STATE"

notify() {
  local msg="Compass: $1"
  log "$msg"
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"${msg//\"/\'}\" with title \"Compass watchdog\" sound name \"Basso\"" >/dev/null 2>&1 || true
  fi
  if [ -n "$WEBHOOK" ]; then
    curl -fsS -m 10 -H "Title: Compass watchdog" -d "$msg" "$WEBHOOK" >/dev/null 2>&1 || log "alert webhook failed"
  fi
}

# problem <key> <message>: alert, at most once per 6 hours per key.
problem() {
  local f="$STATE/$1.alert"
  if [ ! -f "$f" ] || [ -n "$(find "$f" -mmin +360 2>/dev/null)" ]; then
    notify "$2"
    touch "$f"
  fi
}
# ok <key> <message>: clear a problem, saying so if it had alerted.
ok() {
  local f="$STATE/$1.alert"
  if [ -f "$f" ]; then rm -f "$f"; notify "$2"; fi
}

# 1. /health
if curl -fsS -m 10 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  rm -f "$STATE/health.misses"
  ok health "site is answering again"
else
  misses=$(( $(cat "$STATE/health.misses" 2>/dev/null || echo 0) + 1 ))
  echo "$misses" > "$STATE/health.misses"
  if [ "$misses" -ge 3 ]; then
    live="$(live_slot)"
    problem health "site has failed its health check $misses times in a row (http://127.0.0.1:$PORT/health); restarting the switch and slot ${live:-none}"
    job_ctl restart switch >/dev/null 2>&1 || log "restarting the switch failed"
    if [ -n "$live" ]; then job_ctl restart "server-$live" >/dev/null 2>&1 || log "restarting $live failed"; fi
    echo 0 > "$STATE/health.misses"
  fi
fi

# 2. disk space
check_disk() { # key path label
  local avail_kb
  avail_kb="$(df -Pk "$2" 2>/dev/null | awk 'NR==2 {print $4}')"
  [ -n "$avail_kb" ] || return 0
  if [ "$avail_kb" -lt $((MIN_FREE_GB * 1024 * 1024)) ]; then
    problem "$1" "only $((avail_kb / 1024 / 1024)) GB free on $3 ($2). Postgres stops when it fills; see 'Disk full' in docs/runbooks-mac.md"
  else
    ok "$1" "disk space on $3 is back above ${MIN_FREE_GB} GB"
  fi
}
check_disk disk-root / "the boot disk (Docker's data)"
check_disk disk-backups "$(backup_dir)" "the backup disk"

# 3. backup freshness
newest="$(find "$(backup_dir)" -maxdepth 1 -name 'compass-*' -type d 2>/dev/null | sort | tail -n1)"
if [ -z "$newest" ] || [ -n "$(find "$newest" -maxdepth 0 -mmin +1560 2>/dev/null)" ]; then
  problem backup "no backup in the last 26 hours in $(backup_dir); see 'Backups' in docs/runbooks-mac.md"
else
  ok backup "backups are current again"
fi

# 4. restore drill result (written by the weekly drill job)
if [ -f "$STATE/drill.failed" ]; then
  problem drill "the last restore drill failed; run make restore-drill and see 'Backups' in docs/runbooks-mac.md"
else
  ok drill "the restore drill passes again"
fi

# 5. off-Mac copy (offsite.sh leaves this flag when a copy fails)
if [ -f "$(backup_dir)/.offsite-failed" ]; then
  problem offsite "the last off-Mac copy of the backup failed (is the drive or cloud folder there?); see ~/Library/Logs/compass/backup.log"
else
  ok offsite "off-Mac backup copies work again"
fi
