#!/usr/bin/env bash
# Expand-only check by effect, not by keyword: builds the base branch's
# schema in a scratch database, applies each new migration in turn, and
# fails if one takes away anything the running code can see:
#   - a table or column disappears (dropped, renamed, or swapped for a copy)
#   - a column changes type, gains NOT NULL, or loses its default
#   - an enum value, primary key, unique constraint or index, or foreign
#     key disappears
# check-migrations.sh catches the obvious keywords quickly; this catches
# the same intent written any other way (CREATE new + copy + DROP old,
# a rename split across two files, ALTER TYPE through USING, ...).
#
# Migrations marked `-- contract: <why>` are allowed to remove things.
#
# Usage: scripts/check-migrations-schema.sh <base-ref>
# Env:   DATABASE_URL  a Postgres server to create the scratch database on
set -euo pipefail

base="$1"
: "${DATABASE_URL:?DATABASE_URL must point at a Postgres server}"
server="${DATABASE_URL%%\?*}"
server="${server%/*}"
db="migration_check_$$"
url="$server/$db"

mapfile -t added < <(git diff --name-only --diff-filter=A "$base" HEAD -- 'prisma/migrations/*/migration.sql' | sort)
if [ "${#added[@]}" -eq 0 ]; then
  echo "no new migrations"
  exit 0
fi

psql "$server/postgres" -qX -v ON_ERROR_STOP=1 -c "create database $db" >/dev/null
trap 'psql "$server/postgres" -qX -c "drop database if exists $db with (force)" >/dev/null 2>&1 || true' EXIT

apply() {
  psql "$url" -qX -v ON_ERROR_STOP=1 -f "$1" >/dev/null
}

# One line per thing the running code depends on.
snapshot() {
  psql "$url" -qAtX -v ON_ERROR_STOP=1 <<'SQL'
select format('column %s.%s type=%s notnull=%s default=%s',
              c.table_name, c.column_name,
              case when c.data_type = 'USER-DEFINED' then c.udt_name else c.data_type end,
              c.is_nullable = 'NO', c.column_default is not null)
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
where c.table_schema = 'public' and c.table_name <> '_prisma_migrations'
union all
-- Keys and foreign keys: dropping one silently loses integrity.
select format('constraint %s.%s %s', cl.relname, co.conname, pg_get_constraintdef(co.oid))
from pg_constraint co
join pg_class cl on cl.oid = co.conrelid
join pg_namespace n on n.oid = cl.relnamespace
where n.nspname = 'public' and co.contype in ('p', 'u', 'f') and cl.relname <> '_prisma_migrations'
union all
-- Prisma's @unique and @@unique are unique indexes.
select format('unique-index %s.%s', i.tablename, i.indexname)
from pg_indexes i
where i.schemaname = 'public' and i.indexdef like 'CREATE UNIQUE INDEX%' and i.tablename <> '_prisma_migrations'
union all
select format('enum %s.%s', t.typname, e.enumlabel)
from pg_enum e join pg_type t on t.oid = e.enumtypid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
order by 1;
SQL
}

# The base schema: every migration except the new ones, in order.
is_added() {
  local f
  for f in "${added[@]}"; do [ "$f" = "$1" ] && return 0; done
  return 1
}
for f in prisma/migrations/*/migration.sql; do
  is_added "$f" || apply "$f"
done

before="$(mktemp)"
after="$(mktemp)"
snapshot > "$before"
echo "base schema: $(grep -c '^column' "$before") columns, $(grep -c '^enum' "$before") enum values"

status=0
for f in "${added[@]}"; do
  if ! apply "$f"; then
    echo "::error file=${f}::migration fails to apply on the base schema"
    status=1
    break
  fi
  snapshot > "$after"
  # Lines from the BASE schema that no longer hold. Things this PR added
  # itself aren't live yet, so later files may still change them.
  lost="$(comm -23 "$before" "$after")"
  if [ -n "$lost" ]; then
    if grep -qiE '^[[:space:]]*--[[:space:]]*contract:' "$f"; then
      echo "contract migration (marked): $f"
    else
      echo "::error file=${f}::not expand-only: the live revision depends on what this removes or changes. Split it (expand now, contract later) or mark it '-- contract: <reason>'."
      printf '%s\n' "$lost" | sed 's/^/  lost: /'
      status=1
    fi
    # Judge later files against what's there now.
    comm -12 "$before" "$after" > "$before.next"
    mv "$before.next" "$before"
  fi
done

[ "$status" = 0 ] && echo "${#added[@]} new migration(s) are expand-only by effect"
exit "$status"
