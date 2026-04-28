#!/usr/bin/env bash
# Build, push, and deploy a new Cloud Run revision from local source.
#
# Usage:
#   scripts/deploy.sh [tag]
#
# Defaults: PROJECT=scouthosting-prod, REGION=us-central1,
# REPO=scouthosting, SERVICE=scouthosting-prod-app, tag=$(git rev-parse --short HEAD).
#
# Override with env vars:
#   PROJECT=my-proj REGION=us-east1 SERVICE=my-svc scripts/deploy.sh
#
# Cloud Build (cloudbuild.yaml) does this same flow on every commit when
# you wire a trigger; this script is for manual / one-off deploys.

set -euo pipefail

PROJECT="${PROJECT:-scouthosting-prod}"
REGION="${REGION:-us-central1}"
REPO="${REPO:-scouthosting}"
SERVICE="${SERVICE:-scouthosting-prod-app}"
TAG="${1:-$(git rev-parse --short HEAD)}"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/app:${TAG}"

echo "==> Building $IMAGE"
docker build -t "$IMAGE" .

echo "==> Pushing $IMAGE"
docker push "$IMAGE"

echo "==> Deploying $SERVICE in $REGION"
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --project="$PROJECT" \
  --quiet

echo "==> Done. Latest revision:"
gcloud run services describe "$SERVICE" \
  --region="$REGION" --project="$PROJECT" \
  --format="value(status.latestReadyRevisionName,status.url)"
