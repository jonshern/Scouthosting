#!/usr/bin/env bash
# Copy Terraform outputs into GitHub Actions repository variables so the
# workflows know where to deploy: this repository gets the full deployer,
# Waypoint's and Summit's repositories get the web-only publisher.
# Run after `terraform apply` in infra/bootstrap and again after the first apply of infra/.
#
# Needs: terraform, jq, gh (signed in with access to the repo).
set -euo pipefail
repo="${1:-jonshern/Scouthosting}"
root="$(cd "$(dirname "$0")/.." && pwd)"

set_var() { gh variable set "$1" --repo "$repo" --body "$2" && echo "  $1 = $2"; }

boot=$(terraform -chdir="$root/infra/bootstrap" output -json)
project=$(jq -r '.tfstate_bucket.value | sub("-tfstate$"; "")' <<<"$boot")

echo "Setting variables on $repo:"
set_var GCP_PROJECT_ID "$project"
set_var GCP_WORKLOAD_IDENTITY_PROVIDER "$(jq -r .workload_identity_provider.value <<<"$boot")"
set_var GCP_DEPLOYER_SA "$(jq -r .deployer_service_account.value <<<"$boot")"

for web_repo in jonshern/bluecard jonshern/emmett-scouting; do
  echo "Setting variables on $web_repo:"
  gh variable set GCP_PROJECT_ID --repo "$web_repo" --body "$project"
  gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --repo "$web_repo" --body "$(jq -r .workload_identity_provider.value <<<"$boot")"
  gh variable set GCP_DEPLOYER_SA --repo "$web_repo" --body "$(jq -r .web_deployer_service_account.value <<<"$boot")"
done

if main=$(terraform -chdir="$root/infra" output -json 2>/dev/null) && [ "$(jq 'length' <<<"$main")" -gt 0 ]; then
  set_var CORE_URL_PROD "$(jq -r .environments.value.prod.app_url <<<"$main")"
else
  echo "  (infra/ not applied yet: rerun this after the first apply for the server URL)"
fi
