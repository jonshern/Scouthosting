#!/usr/bin/env bash
# Blue-green deploy of Compass on the host Mac, the same steps as the
# cloud deploy (scripts/deploy-api.sh):
#
#   1. back up the database and uploads (stop if that fails)
#   2. check out REF in the idle slot, npm ci, build. The live slot
#      keeps serving the whole time.
#   3. apply migrations. They are expand-only (CI checks), so the live
#      slot keeps working on the new schema.
#   4. start the idle slot on its own port; /health must report REF's
#      commit and /login must render
#   5. flip the switch (port 3000) to it, check again through the switch,
#      and flip back if that fails
#   6. leave the old slot running: rollback.sh flips back instantly
#
#   scripts/host/deploy.sh            # newest origin/main
#   scripts/host/deploy.sh <ref>      # a tag, branch or commit
#
# The first run (no slot live yet) builds blue and points the switch at it.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

REF="${1:-origin/main}"
SLOTS="$(slots_dir)"
mkdir -p "$SLOTS"

git -C "$ROOT" fetch --quiet origin
NEW="$(git -C "$ROOT" rev-parse "$REF^{commit}")" || die "unknown ref: $REF"

# The build and the slots run on whatever `node` launchd finds. A
# `brew upgrade` can move that to a new major the code was never tested
# on (CI and the Dockerfile use .nvmrc's), so refuse before building.
WANT_NODE="$(git -C "$ROOT" show "$NEW:.nvmrc" 2>/dev/null | grep -oE '[0-9]+' | head -n1 || true)"
HAVE_NODE="$(node -p 'process.versions.node.split(".")[0]')"
if [ -n "$WANT_NODE" ] && [ "$HAVE_NODE" != "$WANT_NODE" ]; then
  die "this Mac runs Node $HAVE_NODE but ${NEW:0:8} wants Node $WANT_NODE (.nvmrc); see 'Upgrades and reboots' in docs/runbooks-mac.md"
fi

LIVE="$(live_slot)"
if [ -n "$LIVE" ]; then
  IDLE="$(other_slot "$LIVE")"
  LIVE_SHA="$(git -C "$SLOTS/$LIVE" rev-parse HEAD 2>/dev/null || echo none)"
  if [ "$LIVE_SHA" = "$NEW" ]; then log "$LIVE already serves ${NEW:0:8}"; exit 0; fi
  log "live: $LIVE (${LIVE_SHA:0:8}); deploying ${NEW:0:8} to $IDLE"
  git -C "$ROOT" log --oneline "$LIVE_SHA..$NEW" 2>/dev/null | head -n 30 >&2 || true
else
  IDLE=blue
  log "no slot is live yet; deploying ${NEW:0:8} to blue"
fi
DIR="$SLOTS/$IDLE"
PORT_IDLE="$(slot_port "$IDLE")"

log "backing up"
"$ROOT/scripts/host/backup.sh" >/dev/null || die "backup failed; nothing was changed"

# The idle slot is free to rebuild: stop whatever old build it holds.
job_ctl stop "server-$IDLE"

if [ ! -d "$DIR/.git" ] && [ ! -f "$DIR/.git" ]; then
  git -C "$ROOT" worktree add --detach --force "$DIR" "$NEW" >/dev/null
else
  # -f: the slot is ours; drop anything a build touched (tsconfig.json).
  git -C "$DIR" checkout --quiet -f --detach "$NEW"
fi
ln -sfn "$ROOT/.env" "$DIR/.env"

BUILD_LOG="$SLOTS/$IDLE-build.log"
log "building $IDLE (log: $BUILD_LOG)"
if ! (
  cd "$DIR" &&
    npm ci --no-audit --no-fund &&
    node_modules/.bin/prisma generate &&
    rm -rf .next &&
    node_modules/.bin/next build
) > "$BUILD_LOG" 2>&1; then
  tail -n 30 "$BUILD_LOG" >&2
  die "build failed; the live slot ($LIVE) is untouched"
fi

log "applying migrations"
(cd "$DIR" && node_modules/.bin/prisma migrate deploy) >> "$BUILD_LOG" 2>&1 ||
  die "a migration failed; the live slot still serves. See 'Deploy failed' in docs/runbooks-mac.md"

job_ctl start "server-$IDLE"
if ! wait_healthy "$PORT_IDLE" "$NEW"; then
  job_ctl stop "server-$IDLE"
  die "$IDLE didn't pass /health and /login on :$PORT_IDLE (see ~/Library/Logs/compass/server-$IDLE.log); the live slot still serves"
fi

set_live "$IDLE"
log "switched to $IDLE"
if wait_healthy "$(switch_port)" "$NEW" 15; then
  log "deploy done: ${NEW:0:8} serves from $IDLE; ${LIVE:-nothing} stays up for rollback (make rollback)"
  exit 0
fi

if [ -n "$LIVE" ]; then
  set_live "$LIVE"
  die "the switch didn't serve $IDLE healthily; flipped back to $LIVE"
fi
die "the switch on :$(switch_port) isn't serving; is com.compass.switch running? (make host-install)"
