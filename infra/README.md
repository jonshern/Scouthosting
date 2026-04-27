# Scouthosting infrastructure

Terraform modules for deploying Scouthosting.

## Targets

| Target | Status | Path |
|---|---|---|
| GCP (Cloud Run + Cloud SQL + GCS) | **Active** | [`infra/gcp/`](./gcp/) |
| AWS (Fargate + RDS + S3) | Stub for future | [`infra/aws/`](./aws/) |
| Fly.io | Considered, not built | — |

The application is cloud-agnostic at every boundary:

| Concern | Knob |
|---|---|
| Object storage | `STORAGE_DRIVER` (`fs` / `gcs`) — `lib/storage.js` |
| Email | `MAIL_DRIVER` (`console` / `smtp` / `resend` / `ses` — partially wired) — `lib/mail.js` |
| Database | `DATABASE_URL` — Prisma + Postgres |
| Apex | `APEX_DOMAIN` — multi-tenant routing in `server/index.js` |
| Cookie scope | `COOKIE_DOMAIN` — Lucia session cookie |

## Deploy to GCP — one-time setup

You need: a GCP project, the `gcloud` and `terraform` CLIs, and a domain
where you can set DNS records.

### 1. Create the project + Artifact Registry repo

```bash
PROJECT=scouthosting-prod
REGION=us-central1

gcloud projects create "$PROJECT"
gcloud config set project "$PROJECT"
gcloud billing projects link "$PROJECT" --billing-account=<YOUR_BILLING_ID>

gcloud services enable artifactregistry.googleapis.com cloudbuild.googleapis.com

gcloud artifacts repositories create scouthosting \
  --repository-format=docker --location="$REGION" \
  --description="Scouthosting container images"

gcloud auth configure-docker "$REGION-docker.pkg.dev"
```

### 2. Build and push the image

From the repo root:

```bash
PROJECT=scouthosting-prod
REGION=us-central1
TAG=$(git rev-parse --short HEAD)
IMAGE="$REGION-docker.pkg.dev/$PROJECT/scouthosting/app:$TAG"

docker build -t "$IMAGE" .
docker push "$IMAGE"
```

(Or use Cloud Build: `gcloud builds submit --tag "$IMAGE"`.)

### 3. Create app secrets in Secret Manager

Terraform doesn't write the app secrets — only the DB password it
generates. Create the rest manually so values stay out of state:

```bash
echo -n "$(openssl rand -hex 32)" | \
  gcloud secrets create scouthosting-rsvp-secret --data-file=-

echo -n "<your-google-oauth-client-id>" | \
  gcloud secrets create scouthosting-google-client-id --data-file=-

echo -n "<your-google-oauth-client-secret>" | \
  gcloud secrets create scouthosting-google-client-secret --data-file=-
```

### 4. Apply the Terraform

```bash
cd infra/gcp
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: project_id, region, apex_domain, image (use $IMAGE
# from step 2).

terraform init
terraform plan
terraform apply
```

This provisions:

- Cloud Run v2 service (the app)
- Cloud SQL Postgres 16 (regional in prod, zonal otherwise)
- GCS bucket for uploads
- HTTPS load balancer with managed wildcard cert (apex + `*.apex`)
- IAM bindings so the runtime service account can read secrets, write
  GCS, and reach Cloud SQL

It outputs:
- `load_balancer_ip` — point your DNS at this IP
- `cloud_run_url` — direct Cloud Run URL for smoke testing before DNS

### 5. DNS

At your registrar (or in Cloud DNS):

```
A    <apex>            -> <load_balancer_ip>
A    *.<apex>          -> <load_balancer_ip>
```

The managed wildcard cert provisions over the next 15–60 minutes.

### 6. Smoke test

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<apex>/
curl -s -o /dev/null -w '%{http_code}\n' https://troop100.<apex>/   # if you've seeded
```

## Subsequent deploys

```bash
TAG=$(git rev-parse --short HEAD)
IMAGE="us-central1-docker.pkg.dev/scouthosting-prod/scouthosting/app:$TAG"
docker build -t "$IMAGE" . && docker push "$IMAGE"

cd infra/gcp
terraform apply -var "image=$IMAGE"
```

Migrations run on container boot (`prisma migrate deploy`) — they're
idempotent, so multiple Cloud Run instances coming up at the same time
won't conflict.

## State backend

Before the first production apply, configure a remote backend in
`versions.tf`:

```hcl
terraform {
  backend "gcs" {
    bucket = "scouthosting-tfstate"
    prefix = "envs/prod"
  }
}
```

Create the bucket once with versioning + uniform access:

```bash
gcloud storage buckets create gs://scouthosting-tfstate \
  --location=us --uniform-bucket-level-access --enable-versioning
```

## Cost ballpark

Floor at small scale (US):

| Item | Approx. |
|---|---|
| Cloud Run (idle, scale-to-zero) | $0 |
| Cloud SQL `db-f1-micro` | ~$10/mo |
| GCS uploads (1 GB) | <$1/mo |
| HTTPS Load Balancer | ~$18/mo (this is the floor on GCP) |
| Cloud SQL backups | <$1/mo |
| **Total** | **~$30/mo** |

Bump Cloud SQL to `db-custom-2-7680` and `availability_type = REGIONAL`
for production traffic. Cloud Run scales billed-by-the-millisecond so
the app cost stays small until traffic justifies it.
