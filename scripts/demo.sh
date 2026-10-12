#!/usr/bin/env bash
# The public demo on this machine: Compass in demo mode (sample Troop 42,
# shared demo accounts, outbox instead of email) with its own database,
# so your dev data in `compass` is never touched. See docs/demo.md.
#
#   scripts/demo.sh up      create + migrate the demo database, then run on :3100
#   scripts/demo.sh reset   put the demo back to its starting point now
#
# `make demo` and `make demo-reset` call this. DEMO_PORT and DEMO_DB move
# it (defaults 3100 and compass_demo).
set -euo pipefail
cd "$(dirname "$0")/.."

DEMO_PORT="${DEMO_PORT:-3100}"
DEMO_DB="${DEMO_DB:-compass_demo}"

if [ ! -f .env ]; then
  echo "No .env yet. Run 'make bootstrap' once first." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

# Same server and login as dev, different database name.
DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed -E "s#/[^/?]+(\\?|\$)#/${DEMO_DB}\\1#")"
export DATABASE_URL DEMO_MODE=1 PORT="$DEMO_PORT" DISABLE_INVITE_GATE=1 JOBS_DISABLED=1
# Its own build folder, so it runs beside `make dev` from the same checkout.
export NEXT_DIST_DIR=.next-demo

case "${1:-up}" in
  up)
    if ! docker exec compass-postgres psql -U compass -d compass -tAc "select 1 from pg_database where datname = '${DEMO_DB}'" | grep -q 1; then
      docker exec compass-postgres createdb -U compass "$DEMO_DB"
      echo "created database ${DEMO_DB}"
    fi
    node_modules/.bin/prisma migrate deploy
    echo
    echo "Demo: http://localhost:${DEMO_PORT}/demo   (the sample troop is seeded on first start)"
    echo "Accounts admin@, leader@, counselor@, parent@demo.invalid, password TryTheDemo42!"
    echo
    exec node_modules/.bin/next dev -p "$DEMO_PORT"
    ;;
  reset)
    exec node_modules/.bin/tsx scripts/demo-reset.ts
    ;;
  *)
    sed -n '2,10p' "$0"
    exit 2
    ;;
esac
