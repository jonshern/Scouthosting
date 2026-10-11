#!/bin/sh
# Migrate step for GCP (the core-migrate-<env> Cloud Run job):
#   1. apply Prisma migrations as the schema owner
#   2. give the app's own login row access only, so the running app can't
#      alter or drop tables
#
# Env: DATABASE_URL (owner login), APP_DB_ROLE (optional app login name).
set -eu
# The image has no npm/npx; call the local binaries from the app root.
cd "$(dirname "$0")/.."

node_modules/.bin/prisma migrate deploy

if [ -n "${APP_DB_ROLE:-}" ]; then
  case "$APP_DB_ROLE" in
    *[!a-z0-9_]* | [!a-z_]*) echo "invalid APP_DB_ROLE: $APP_DB_ROLE" >&2; exit 1 ;;
  esac
  r="\"$APP_DB_ROLE\""
  node_modules/.bin/prisma db execute --url "$DATABASE_URL" --stdin <<SQL
grant usage on schema public to $r;
grant select, insert, update, delete on all tables in schema public to $r;
grant usage, select on all sequences in schema public to $r;
revoke all on _prisma_migrations from $r;
alter default privileges in schema public grant select, insert, update, delete on tables to $r;
alter default privileges in schema public grant usage, select on sequences to $r;
SQL
  echo "granted row access to $APP_DB_ROLE"
fi
