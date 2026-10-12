#!/usr/bin/env bash
# Run one blue-green slot of Compass (the production build, `next start`)
# on that slot's port. launchd runs this as com.compass.server-<slot>
# (install-launchd.sh) and restarts it if it crashes.
#
#   scripts/host/run-server.sh blue|green
#
# The slot's code lives in $SLOTS_DIR/<slot> (deploy.sh creates and
# builds it). Secrets come from .env in this checkout, shared by both
# slots, and both slots store uploads in this checkout's .local-uploads.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SLOT="${1:-}"
case "$SLOT" in blue|green) ;; *) die "usage: run-server.sh blue|green" ;; esac
DIR="$(slots_dir)/$SLOT"

if [ ! -f "$DIR/.next/BUILD_ID" ]; then
  # Exit 0 so launchd (KeepAlive: SuccessfulExit false) doesn't retry a
  # slot that has never been deployed.
  log "slot $SLOT has no build yet ($DIR); deploy.sh builds it"
  exit 0
fi

set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a

export NODE_ENV=production
export PORT; PORT="$(slot_port "$SLOT")"
export GIT_SHA; GIT_SHA="$(git -C "$DIR" rev-parse HEAD)"
export LOCAL_UPLOADS_DIR="${LOCAL_UPLOADS_DIR:-$ROOT/.local-uploads}"
export COMPASS_SLOT="$SLOT"

cd "$DIR" || exit 1
log "starting Compass ${GIT_SHA:0:8} in slot $SLOT on 127.0.0.1:$PORT"
# Slots listen on loopback only; the switch is the way in.
exec node_modules/.bin/next start -H 127.0.0.1 -p "$PORT"
