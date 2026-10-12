# shellcheck shell=bash disable=SC2034
# Shared helpers for the scripts in scripts/host/ (sourced, not run).
#
# Reads DATABASE_URL from the environment or .env at the repo root and
# runs Postgres tools inside the compass-postgres container when it is
# up (so the tools always match the server version), otherwise on the
# host with the URL.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_CONTAINER="${PG_CONTAINER:-compass-postgres}"

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# Read KEY from .env without sourcing the whole file (values may hold
# characters a shell would expand). Environment wins over .env.
env_get() {
  local key="$1" val=""
  val="$(printenv "$key" 2>/dev/null || true)"
  if [ -z "$val" ] && [ -f "$ROOT/.env" ]; then
    val="$(grep -E "^${key}=" "$ROOT/.env" | tail -n1 | cut -d= -f2- || true)"
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  fi
  printf '%s' "$val"
}

DATABASE_URL="$(env_get DATABASE_URL)"
[ -n "$DATABASE_URL" ] || die "DATABASE_URL is not set (environment or $ROOT/.env)"
# libpq rejects Prisma's ?schema=public; drop the query string.
PG_URL="${DATABASE_URL%%\?*}"
DB_NAME="${PG_URL##*/}"
DB_USER="$(printf '%s' "$PG_URL" | sed -E 's#^[a-z]+://([^:@/]+).*#\1#')"

use_container() {
  command -v docker >/dev/null 2>&1 &&
    [ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null || true)" = "true" ]
}

# conn <db>: the connection argument for a Postgres tool, in whichever
# place the tool runs (container: a database name; host: a full URL).
conn() {
  if use_container; then printf '%s' "$1"; else printf '%s' "${PG_URL%/*}/$1"; fi
}

# pg_run <tool> [args...]: run a Postgres client tool, with stdin.
pg_run() {
  local tool="$1"; shift
  if use_container; then
    docker exec -i "$PG_CONTAINER" "$tool" -U "$DB_USER" "$@"
  else
    command -v "$tool" >/dev/null 2>&1 || die "$tool not found and container $PG_CONTAINER is not running"
    "$tool" "$@"
  fi
}

# psql against a named database. Usage: psql_db <db> [psql args...]
psql_db() {
  local db="$1"; shift
  pg_run psql -d "$(conn "$db")" -v ON_ERROR_STOP=1 -X -q "$@"
}

# Row counts for every table in the public schema, "table count" per line,
# sorted. Exact counts, so backup and restore can be compared line for line.
table_counts() {
  local db="$1"
  psql_db "$db" -At <<'SQL'
select format('select %L || '' '' || count(*) from %I.%I;', table_name, table_schema, table_name)
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name
\gexec
SQL
}

uploads_dir() {
  local d
  d="$(env_get LOCAL_UPLOADS_DIR)"
  printf '%s' "${d:-$ROOT/.local-uploads}"
}

backup_dir() {
  local d
  d="$(env_get BACKUP_DIR)"
  # Default: next to the checkout, so a backup survives deleting or
  # re-cloning it and lives off the Docker volume.
  printf '%s' "${d:-$(dirname "$ROOT")/compass-backups}"
}

# Fingerprint of MASTER_KEY: lets restore check that the key in hand
# can read the backup without ever writing the key itself to disk.
master_key_fingerprint() {
  local k
  k="$(env_get MASTER_KEY)"
  [ -n "$k" ] || { printf 'none'; return; }
  printf '%s' "$k" | tr 'A-F' 'a-f' | sha256_stdin | cut -c1-12
}

sha256_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1
  else shasum -a 256 | cut -d' ' -f1; fi
}

sha256_file() { sha256_stdin < "$1"; }

# --- blue-green slots (deploy.sh, rollback.sh, switch.mjs) ---
# Two checkouts of the code, each with its own node_modules and build,
# served on their own ports; the switch on PORT (3000) points at one.

slots_dir() {
  local d
  d="$(env_get SLOTS_DIR)"
  printf '%s' "${d:-$(dirname "$ROOT")/compass-slots}"
}
switch_state() { printf '%s/active' "$(slots_dir)"; }
switch_port() { local p; p="$(env_get PORT)"; printf '%s' "${p:-3000}"; }
slot_port() { # blue|green
  local p
  case "$1" in
    blue) p="$(env_get BLUE_PORT)"; printf '%s' "${p:-3001}" ;;
    green) p="$(env_get GREEN_PORT)"; printf '%s' "${p:-3002}" ;;
    *) die "unknown slot: $1" ;;
  esac
}
live_slot() { cut -d' ' -f1 "$(switch_state)" 2>/dev/null || true; }
other_slot() { if [ "$1" = blue ]; then echo green; else echo blue; fi; }

# set_live <slot>: point the switch at a slot. Written to a temp file
# and renamed, so the switch never reads half a line.
set_live() {
  local f tmp
  f="$(switch_state)"
  tmp="$f.tmp.$$"
  printf '%s %s\n' "$1" "$(slot_port "$1")" > "$tmp"
  mv -f "$tmp" "$f"
}

# healthy <port> [commit]: /health ok (from that commit's build when
# given) and /login renders: the same checks as scripts/deploy-api.sh.
healthy() {
  local body
  body="$(curl -fsS -m 10 "http://127.0.0.1:$1/health" 2>/dev/null)" || return 1
  case "$body" in *'"ok":true'*) ;; *) return 1 ;; esac
  if [ -n "${2:-}" ]; then
    case "$body" in *"\"version\":\"${2:0:12}\""*) ;; *) return 1 ;; esac
  fi
  curl -fsS -m 10 -o /dev/null "http://127.0.0.1:$1/login" 2>/dev/null
}

# wait_healthy <port> [commit] [tries]: poll healthy every 2 seconds.
wait_healthy() {
  local n="${3:-60}"
  for _ in $(seq 1 "$n"); do
    if healthy "$1" "${2:-}"; then return 0; fi
    sleep 2
  done
  return 1
}

LAUNCHD_PREFIX="${COMPASS_LAUNCHD_PREFIX:-com.compass}"
# job_ctl <start|stop|restart> <job>: control a launchd job (server-blue, switch, ...).
job_ctl() {
  local label="$LAUNCHD_PREFIX.$2" domain plist
  domain="gui/$(id -u)"
  plist="$HOME/Library/LaunchAgents/$label.plist"
  command -v launchctl >/dev/null 2>&1 || die "launchctl not found (macOS only)"
  case "$1" in
    stop) launchctl bootout "$domain/$label" 2>/dev/null || true ;;
    start)
      # Loaded but not running (a slot with no build exits 0): kickstart.
      if launchctl print "$domain/$label" >/dev/null 2>&1; then launchctl kickstart "$domain/$label"
      else launchctl bootstrap "$domain" "$plist"; fi ;;
    restart)
      if launchctl print "$domain/$label" >/dev/null 2>&1; then launchctl kickstart -k "$domain/$label"
      else launchctl bootstrap "$domain" "$plist"; fi ;;
  esac
}
