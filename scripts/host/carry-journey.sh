#!/usr/bin/env bash
# Copy Lantern trail changes made since a backup from one database into
# another. rollback.sh --with-data runs it after putting the database
# back to the backup from before a deploy, so check marks, logs, notes,
# photos and new scouts from after that backup aren't lost.
#
#   scripts/host/carry-journey.sh FROM_DB TO_DB SINCE
#
# SINCE is a backup's created_at (20261017T050002Z); rows changed up to
# 10 minutes before it are carried too (a row written during the dump
# may or may not be in it; carrying it again changes nothing). Each row
# is added, or replaces the row with the same key in TO_DB:
#
#   JourneyScout        by id          (owner must exist in TO_DB)
#   JourneyProgress     by scout+step
#   JourneyEntry        by scout+clientId
#   JourneyScoutDevice  by id          (a scout phone set up since)
#
# Only columns both databases have are copied, so it works across the
# schemas on either side of a migration. What it can't carry: a step
# unchecked or a scout removed after the backup comes back (the row is
# gone, so there's nothing newer to copy), and a trail on an account
# made after the backup (its User row isn't in TO_DB).

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

FROM="${1:-}"; TO="${2:-}"; SINCE="${3:-}"
[ -n "$FROM" ] && [ -n "$TO" ] && [ -n "$SINCE" ] || die "usage: carry-journey.sh FROM_DB TO_DB SINCE"
for db in "$FROM" "$TO"; do case "$db" in *[!a-zA-Z0-9_]*) die "invalid database name: $db" ;; esac; done
since="$(printf '%s' "$SINCE" | sed -nE 's/^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/\1-\2-\3 \4:\5:\6/p')"
[ -n "$since" ] || die "SINCE must look like 20261017T050002Z, got $SINCE"

# table|conflict target|changed-at expression|filter on the TO side
TABLES='JourneyScout|("id")|"updatedAt"|"ownerUserId" in (select id from "User")
JourneyProgress|("scoutId", "key")|"updatedAt"|"scoutId" in (select id from "JourneyScout")
JourneyEntry|("scoutId", "clientId")|"updatedAt"|"scoutId" in (select id from "JourneyScout")
JourneyScoutDevice|("id")|greatest("createdAt", coalesce("lastUsedAt", "createdAt"), coalesce("revokedAt", "createdAt"))|"scoutId" in (select id from "JourneyScout")'

columns() { # db table: one column per line, in table order
  psql_db "$1" -At -c "select column_name from information_schema.columns where table_schema = 'public' and table_name = '$2' order by ordinal_position"
}

SCRIPT="$(mktemp)"; trap 'rm -f "$SCRIPT"' EXIT
INSERTS=""
{
  echo 'begin;'
  echo 'create temp table carry_in (t text, b text);'
  echo 'copy carry_in from stdin;'
} > "$SCRIPT"

while IFS='|' read -r table conflict changed filter; do
  from_cols="$(columns "$FROM" "$table")"
  if [ -z "$from_cols" ] || [ -z "$(columns "$TO" "$table")" ]; then
    log "skip  $table (not in both databases)"
    continue
  fi
  # TO's columns that FROM also has, in TO's order.
  cols=(); while read -r c; do grep -qxF "$c" <<<"$from_cols" && cols+=("$c"); done < <(columns "$TO" "$table")
  list="$(printf '"%s",' "${cols[@]}")"; list="${list%,}"
  # base64 on one line, so the JSON (with its own newlines and
  # backslashes) passes through COPY untouched.
  payload="$(psql_db "$FROM" -At -c "select translate(encode(convert_to(coalesce(json_agg(t)::text, '[]'), 'UTF8'), 'base64'), E'\n', '') from (select $list from \"$table\" where $changed > timestamp '$since' - interval '10 minutes') t")"
  printf '%s\t%s\n' "$table" "$payload" >> "$SCRIPT"

  select_list="$list"
  # A roster link to a Member the restored database doesn't have is dropped, not an error.
  [ "$table" = JourneyScout ] && select_list="${select_list/\"memberId\"/case when \"memberId\" in (select id from \"Member\") then \"memberId\" end}"
  updates=""
  for c in "${cols[@]}"; do [ "$c" = id ] || updates+="\"$c\" = excluded.\"$c\", "; done
  INSERTS+="with src as (select * from json_populate_recordset(null::\"$table\", (select convert_from(decode(b, 'base64'), 'UTF8')::json from carry_in where t = '$table'))),
  ins as (insert into \"$table\" ($list) select $select_list from src where $filter
          on conflict $conflict do update set ${updates%, } returning 1)
select '$table ' || (select count(*) from ins) || ' of ' || (select count(*) from src);
"
done <<<"$TABLES"

{
  printf '\\.\n'
  printf '%s' "$INSERTS"
  echo 'commit;'
} >> "$SCRIPT"

log "carrying Lantern changes since $since from $FROM into $TO"
out="$(psql_db "$TO" -At < "$SCRIPT")" || die "carrying Lantern changes failed; $TO is unchanged"
while read -r line; do [ -n "$line" ] && log "      $line rows carried"; done <<<"$out"
log "Lantern now: $(journey_summary "$TO")"
