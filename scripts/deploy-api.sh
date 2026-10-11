#!/usr/bin/env bash
# Roll a core (Compass) image out to one environment on GCP:
#   1. run migrations as a Cloud Run job and wait (old revision keeps serving)
#   2. deploy the new revision and send it all traffic
#   3. smoke test /health (database reachable) and roll back on failure
#
# Usage: scripts/deploy-api.sh <staging|prod> <image>
# Needs gcloud signed in with run/region set (CI does this).
set -euo pipefail

env_name="$1"
image="$2"
service="core-${env_name}"
job="core-migrate-${env_name}"

echo "::group::Migrate ${env_name}"
gcloud run jobs update "$job" --image "$image" --quiet
gcloud run jobs execute "$job" --wait --quiet
echo "::endgroup::"

previous=$(gcloud run services describe "$service" --format='value(status.latestReadyRevisionName)')

echo "::group::Deploy ${service}"
gcloud run deploy "$service" --image "$image" --quiet
gcloud run services update-traffic "$service" --to-latest --quiet
url=$(gcloud run services describe "$service" --format='value(status.url)')
echo "::endgroup::"

echo "Smoke testing ${url}/health"
for attempt in 1 2 3 4 5 6; do
  if curl -fsS --max-time 10 "${url}/health"; then
    echo
    echo "${service} is live: ${url}"
    exit 0
  fi
  sleep $((attempt * 3))
done

echo "::error::${service} failed its smoke test; sending traffic back to ${previous}"
if [ -n "$previous" ]; then
  gcloud run services update-traffic "$service" --to-revisions "${previous}=100" --quiet
fi
exit 1
