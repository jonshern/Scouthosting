#!/usr/bin/env bash
# Blue-green rollout of a core (Compass) image to one environment on GCP:
#   0. take an on-demand Cloud SQL backup, so a migration that goes wrong
#      can be undone (on top of the nightly backups and point-in-time
#      recovery). SQL_INSTANCE names the instance (default core-pg).
#   1. migrate (Cloud Run job). Migrations are expand-only (see
#      scripts/check-migrations.sh), so the live revision keeps working
#      on the new schema.
#   2. deploy the image as a new revision with NO traffic, tagged "green"
#   3. smoke test green on its own URL; on failure stop here, live
#      traffic never moved
#   4. flip 100% of traffic to green, check the live URL, and flip back to
#      the previous revision if that fails
#
# Usage: scripts/deploy-api.sh <staging|prod> <image>
# Roll back later with scripts/rollback-api.sh.
# Needs gcloud signed in with run/region set (CI does this).
set -euo pipefail

env_name="$1"
image="$2"
service="core-${env_name}"
job="core-migrate-${env_name}"
tag="green"

smoke() {
  # /health checks the database; /login proves the app's pages render.
  local base="$1" attempt
  for attempt in 1 2 3 4 5 6; do
    if curl -fsS --max-time 10 "${base}/health" >/dev/null &&
      curl -fsS --max-time 10 -o /dev/null "${base}/login"; then
      return 0
    fi
    sleep $((attempt * 3))
  done
  return 1
}

echo "::group::Back up the database before migrating"
gcloud sql backups create --instance "${SQL_INSTANCE:-core-pg}" \
  --description "before ${env_name} deploy of ${image##*/}" --quiet
echo "::endgroup::"

echo "::group::Migrate ${env_name}"
gcloud run jobs update "$job" --image "$image" --quiet
gcloud run jobs execute "$job" --wait --quiet
echo "::endgroup::"

# The revision serving 100% now (blue); empty on a brand-new service.
blue=$(gcloud run services describe "$service" --format=json |
  jq -r '[.status.traffic[]? | select(.percent == 100) | .revisionName][0] // empty')

echo "::group::Deploy ${service} (green, no traffic)"
gcloud run deploy "$service" --image "$image" --no-traffic --tag "$tag" --quiet
green=$(gcloud run services describe "$service" --format='value(status.latestCreatedRevisionName)')
green_url=$(gcloud run services describe "$service" --format=json |
  jq -r --arg t "$tag" '.status.traffic[] | select(.tag == $t) | .url')
echo "green: ${green} at ${green_url}"
echo "::endgroup::"

echo "Smoke testing green"
if ! smoke "$green_url"; then
  echo "::error::${green} failed its smoke test; live traffic stays on ${blue:-the current revision}"
  exit 1
fi

echo "::group::Flip traffic to ${green}"
gcloud run services update-traffic "$service" --to-revisions "${green}=100" --quiet
url=$(gcloud run services describe "$service" --format='value(status.url)')
echo "::endgroup::"

if smoke "$url"; then
  echo "${service} is live on ${green}: ${url} (previous: ${blue:-none})"
  exit 0
fi

echo "::error::${service} failed after the flip; sending traffic back to ${blue:-nothing}"
if [ -n "$blue" ]; then
  gcloud run services update-traffic "$service" --to-revisions "${blue}=100" --quiet
fi
exit 1
