#!/usr/bin/env bash
# Blue-green needs expand-only migrations: while a deploy is checked, the
# old revision still serves traffic on the new schema, and a rollback
# returns to it without undoing anything. So a new migration may add
# tables, columns (nullable or with a default) and indexes, but not drop,
# rename or retype what the running code uses.
#
# Fails on new migration files (added since <base>) that do. A contract
# step belongs in a later release, once no live revision uses the old
# shape; mark that file with a line `-- contract: <why it's safe now>`.
#
# Usage: scripts/check-migrations.sh <base-ref>
set -euo pipefail

base="$1"
pattern='drop[[:space:]]+table|drop[[:space:]]+column|rename[[:space:]]+(column|to)|alter[[:space:]]+column[^;]*[[:space:]](type|set[[:space:]]+not[[:space:]]+null)'
status=0

while IFS= read -r file; do
  [ -n "$file" ] || continue
  if grep -qiE '^[[:space:]]*--[[:space:]]*contract:' "$file"; then
    echo "contract migration (marked): $file"
    continue
  fi
  if hits=$(grep -niE "$pattern" "$file"); then
    echo "::error file=${file}::not expand-only; the live revision would break. Split it (expand now, contract later) or mark it '-- contract: <reason>'."
    echo "$hits"
    status=1
  fi
done < <(git diff --name-only --diff-filter=A "$base" HEAD -- 'prisma/migrations/*/migration.sql')

exit "$status"
