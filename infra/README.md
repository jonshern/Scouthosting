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
# RSVP token signing key
echo -n "$(openssl rand -hex 32)" | \
  gcloud secrets create scouthosting-rsvp-secret --data-file=-

# Google OAuth client (https://console.cloud.google.com/apis/credentials)
echo -n "<your-google-oauth-client-id>" | \
  gcloud secrets create scouthosting-google-client-id --data-file=-
echo -n "<your-google-oauth-client-secret>" | \
  gcloud secrets create scouthosting-google-client-secret --data-file=-

# Resend API key (https://resend.com/api-keys). Required if you set
# mail_driver=resend (the default). Empty value is fine for staging if
# you flip mail_driver to "console".
echo -n "<your-resend-api-key>" | \
  gcloud secrets create scouthosting-resend-api-key --data-file=-
```

### Mail provider

The default is **Resend** (`mail_driver = "resend"` in
`terraform.tfvars`). Verify a sending domain in Resend that matches the
`mail_from` value (e.g. `noreply@scouthosting.com`). Resend's free tier
covers the first 3k messages per month.

Alternatives:

- `mail_driver = "console"` — useful for staging; broadcasts log to
  Cloud Run stdout instead of sending. No domain setup.
- `mail_driver = "smtp"` — set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASS` env vars on the Cloud Run service. Use this for Postmark,
  Mailgun, AWS SES SMTP, etc.

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

Two paths.

### Manual one-off

From the repo root:

```bash
scripts/deploy.sh                         # uses git short SHA as the tag
scripts/deploy.sh v2026-04-28             # explicit tag
```

The script builds the Dockerfile, pushes to Artifact Registry, and
runs `gcloud run deploy` against the existing service.

### Automatic on every commit (Cloud Build)

The repo includes a [`cloudbuild.yaml`](../cloudbuild.yaml). Wire a
trigger once, then every push builds + deploys:

```bash
gcloud builds triggers create github \
  --repo-name=scouthosting \
  --repo-owner=<your-github-org> \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml \
  --name=scouthosting-main \
  --region=us-central1
```

Migrations run on container boot (`prisma migrate deploy`) — idempotent
so multiple Cloud Run instances coming up at the same time won't fight.

## Optional Terraform features

Off by default; enable in `terraform.tfvars` when you want them.

### Manage DNS in Terraform (`manage_dns = true`)

Creates a Cloud DNS managed zone for `apex_domain` and writes the apex
+ `*.apex` A records. After `terraform apply`, point your registrar's
NS records at the `dns_name_servers` output.

If you keep DNS at your registrar instead, leave `manage_dns = false`
and set the A records by hand to the `load_balancer_ip` output.

### Uptime monitoring + alert (`alert_email`)

Set `alert_email` to receive a notification when an HTTPS uptime check
on the apex fails for 2 minutes. Creates a Cloud Monitoring uptime
check, an email channel, and an alert policy.

### Budget alert (`billing_account` + `monthly_budget_usd`)

Creates a billing budget at 50% / 90% / 100% of the monthly spend cap.
If `alert_email` is set, the budget overage notifies that channel too.

### Cloud Armor

Enabled automatically. The default policy:

- Allow everything by default
- Per-IP rate limit on auth + provisioning endpoints (60 req/min;
  ban for 5 minutes after 300 req/min sustained)
- Drop common scanner paths (`/wp-admin`, `/.env`, `/.git/`, …)
- Adaptive Layer 7 DDoS protection enabled

Edit `infra/gcp/security.tf` to tighten further.

## Production readiness checklist

Before pointing real Scout-unit traffic at this:

- [ ] Domain registered, `apex_domain` set, DNS records pointing at
      `load_balancer_ip` (or `manage_dns = true` and registrar's NS
      pointing at Cloud DNS)
- [ ] `RESEND_API_KEY` (or SMTP) verified with a test broadcast
- [ ] `MAIL_FROM` domain verified in Resend (DKIM + SPF passing)
- [ ] `RSVP_SECRET` and `AUTH_TOKEN_SECRET` set to fresh `openssl rand`
      values; **not** the dev defaults
- [ ] `GOOGLE_CLIENT_ID/SECRET` set with the production redirect URI
      (`https://<apex>/auth/google/callback`)
- [ ] `COOKIE_DOMAIN=.<apex_domain>` so apex sessions span subdomains
- [ ] `db_tier` upgraded from `db-f1-micro` to at least
      `db-custom-2-7680`, `availability_type = REGIONAL`
- [ ] `alert_email` set; verify the uptime alert by stopping Cloud Run
      briefly
- [ ] `billing_account` set and `monthly_budget_usd` capped
- [ ] Terraform state in a remote GCS backend (versioned + uniform
      access) rather than local
- [ ] Cloud Build trigger wired so deploys go through CI, not the local
      `scripts/deploy.sh`
- [ ] First scrape of the public site through SSL Labs ≥ A grade
- [ ] Per-org backups verified by exporting the demo org via
      `pg_dump --table=... --where="orgId=..."`

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
