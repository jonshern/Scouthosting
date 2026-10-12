#!/usr/bin/env bash
# Send all of a core service's traffic back to an earlier revision.
# Without a revision, picks the newest ready revision older than the one
# serving now. Instant: nothing is rebuilt and no migration runs, which is
# why migrations must stay expand-only (scripts/check-migrations.sh).
#
# Usage: scripts/rollback-api.sh <staging|prod> [revision]
set -euo pipefail

env_name="$1"
service="core-${env_name}"
target="${2:-}"

current=$(gcloud run services describe "$service" --format=json |
  jq -r '[.status.traffic[]? | select(.percent == 100) | .revisionName][0] // empty')

if [ -z "$target" ]; then
  target=$(gcloud run revisions list --service "$service" --sort-by='~metadata.creationTimestamp' \
    --format=json |
    jq -r --arg cur "$current" '
      [.[] | select(any(.status.conditions[]?; .type == "Ready" and .status == "True"))
           | .metadata.name] as $ready
      | ($ready | index($cur)) as $i
      | if $i == null then empty else ($ready[$i + 1] // empty) end')
fi

if [ -z "$target" ]; then
  echo "::error::no earlier ready revision of ${service} to roll back to" >&2
  exit 1
fi

echo "Rolling ${service} back: ${current:-?} -> ${target}"
gcloud run services update-traffic "$service" --to-revisions "${target}=100" --quiet
url=$(gcloud run services describe "$service" --format='value(status.url)')
curl -fsS --max-time 10 "${url}/health" && echo
echo "${service} now serves ${target}"
