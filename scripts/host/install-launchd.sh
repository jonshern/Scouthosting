#!/usr/bin/env bash
# Install (or refresh) the launchd jobs that keep Compass running on
# the host Mac:
#
#   com.compass.switch         the blue-green switch on PORT (3000), run-switch.sh
#   com.compass.server-blue    slot blue on BLUE_PORT (3001), run-server.sh blue
#   com.compass.server-green   slot green on GREEN_PORT (3002), run-server.sh green
#   com.compass.cron       POST /api/cron/run hourly (newsletters, reminders, retention)
#   com.compass.backup     backup.sh nightly at 02:30
#   com.compass.drill      restore.sh --drill Sundays at 04:00
#   com.compass.watchdog   watchdog.sh every 5 minutes
#
#   scripts/host/install-launchd.sh            # install / refresh all
#   scripts/host/install-launchd.sh --remove   # unload and delete them
#
# Logs go to ~/Library/Logs/compass/. Generates TASKS_TOKEN in .env if
# it's missing. Then run deploy.sh to build and start the first slot.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
[ "$(uname)" = "Darwin" ] || die "launchd is macOS only"

AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/compass"
STATE="$HOME/Library/Application Support/compass-watchdog"
DOMAIN="gui/$(id -u)"
JOBS="switch server-blue server-green cron backup drill watchdog"
mkdir -p "$AGENTS" "$LOGS" "$STATE"

unload() { launchctl bootout "$DOMAIN/com.compass.$1" 2>/dev/null || true; }

if [ "${1:-}" = "--remove" ]; then
  for j in $JOBS; do unload "$j"; rm -f "$AGENTS/com.compass.$j.plist"; done
  log "removed the Compass launchd jobs"
  exit 0
fi

if [ -z "$(env_get TASKS_TOKEN)" ]; then
  printf '\nTASKS_TOKEN=%s\n' "$(openssl rand -hex 24)" >> "$ROOT/.env"
  log "generated TASKS_TOKEN in .env"
fi

# launchd starts jobs with a bare PATH; give them the node and docker
# this shell finds.
NODE_DIR="$(dirname "$(command -v node)")"
PATHS="$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:/usr/bin:/bin:/usr/sbin:/sbin"

xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

# plist <job> <command> <schedule-xml>
plist() {
  cat > "$AGENTS/com.compass.$1.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.compass.$1</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>-c</string><string>$(xml "$2")</string></array>
  <key>WorkingDirectory</key><string>$(xml "$ROOT")</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$(xml "$PATHS")</string></dict>
  <key>StandardOutPath</key><string>$(xml "$LOGS/$1.log")</string>
  <key>StandardErrorPath</key><string>$(xml "$LOGS/$1.log")</string>
$3
</dict>
</plist>
PLIST
}

q() { printf "'%s'" "${1//\'/\'\\\'\'}"; }
R="$(q "$ROOT")"
S="$(q "$STATE")"

plist switch "exec $R/scripts/host/run-switch.sh" \
  "  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>"

# KeepAlive only on a crash: run-server.sh exits 0 for a slot that has
# no build yet, and that shouldn't loop.
for slot in blue green; do
  plist "server-$slot" "exec $R/scripts/host/run-server.sh $slot" \
    "  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>"
done

plist cron "curl -fsS -m 300 -X POST -H \"x-tasks-token: \$(grep -E '^TASKS_TOKEN=' $R/.env | tail -n1 | cut -d= -f2-)\" http://127.0.0.1:\$(grep -E '^PORT=' $R/.env | cut -d= -f2- | grep . || echo 3000)/api/cron/run; echo" \
  "  <key>StartInterval</key><integer>3600</integer>"

plist backup "$R/scripts/host/backup.sh" \
  "  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>30</integer></dict>"

plist drill "if $R/scripts/host/restore.sh --drill; then rm -f $S/drill.failed; else touch $S/drill.failed; fi" \
  "  <key>StartCalendarInterval</key><dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>4</integer><key>Minute</key><integer>0</integer></dict>"

plist watchdog "$R/scripts/host/watchdog.sh" \
  "  <key>StartInterval</key><integer>300</integer>"

for j in $JOBS; do
  plutil -lint "$AGENTS/com.compass.$j.plist" >/dev/null || die "bad plist for $j"
  unload "$j"
  launchctl bootstrap "$DOMAIN" "$AGENTS/com.compass.$j.plist"
done
log "installed: $JOBS (logs in $LOGS)"
log "next: scripts/host/deploy.sh (make deploy) builds and starts the first slot"
