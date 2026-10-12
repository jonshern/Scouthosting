#!/usr/bin/env bash
# Flip the switch back to the other slot: the build that was live before
# the last deploy. Instant, nothing rebuilt. Refuses if that slot isn't
# healthy (it's restarted once first if it stopped).
#
#   scripts/host/rollback.sh

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

LIVE="$(live_slot)"
[ -n "$LIVE" ] || die "no slot is live; run deploy.sh"
PREV="$(other_slot "$LIVE")"
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
