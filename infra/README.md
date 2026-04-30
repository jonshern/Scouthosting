# Compass infrastructure

Terraform module for deploying Compass. (Resource names below preserve the
legacy `scouthosting-*` prefix where the actual GCP/Cloud resources still
use it; new deployments can substitute `compass-*`.)

## Active target: GCP + Cloudflare

```
Internet
   │  https://*.compass.app
   ▼
Cloudflare  ── DNS, wildcard SSL, WAF, rate limit, edge cache, $0
   │  via CNAME → *.run.app, X-Origin-Auth header injected
   ▼
Cloud Run (Node + Express)  ── scales to zero, ~$0 idle
   │  Cloud SQL Auth Proxy (unix socket /cloudsql/...)
   ▼
Cloud SQL Postgres 16  ── ~$7/mo on db-f1-micro
   │
   ▼ (uploads, lib/storage.js with STORAGE_DRIVER=gcs)
Cloud Storage bucket  ── ~$0.02/mo
```

**Why no GCP load balancer?** It costs ~$36/mo (two forwarding rules at
$18.25 each). Cloudflare's free tier handles the same job — wildcard
DNS, SSL termination, WAF, rate limiting — for $0. The only thing we
have to do app-side is reject requests that didn't come through
Cloudflare; that's the `X-Origin-Auth` shared-secret middleware in
`lib/originAuth.js`.

**Total floor at small scale: ~$10–15/mo.**

| Item | Approx. |
|---|---|
| Cloudflare (free) | $0 |
| Cloud Run (idle, scale-to-zero) | $0 |
| Cloud SQL `db-f1-micro` | ~$7 |
| GCS uploads (1 GB) | <$1 |
| Resend mail (free 3k/mo) | $0 |
| Logs / Monitoring | $0 within free tier |
| **Total** | **~$10/mo** |

## Layout

```
infra/gcp/
├── versions.tf           providers (google, cloudflare)
├── variables.tf          project, region, env, apex, image, secrets,
│                          mail, cloudflare token + zone id, alerts, budget
├── main.tf               project APIs, runtime SA, IAM
├── sql.tf                Cloud SQL Postgres 16 + DATABASE_URL secret
├── run.tf                Cloud Run v2 service
├── storage.tf            GCS uploads bucket
├── origin_auth.tf        Random X-Origin-Auth secret + Secret Manager
├── cloudflare.tf         DNS records, SSL settings, WAF rules,
│                          origin-auth Transform Rule, rate limit
├── monitoring.tf         Optional uptime check + email alert
├── budget.tf             Optional billing budget at 50/90/100%
├── outputs.tf            cloud_run_url, cloud_sql_connection_name, etc.
├── terraform.tfvars.example
└── .gitignore
```

## One-time setup

You need: a GCP project, a domain in Cloudflare, the `gcloud` and
`terraform` CLIs, Docker.

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
  --description="Compass container images"

gcloud auth configure-docker "$REGION-docker.pkg.dev"
```

### 2. Build and push the image

```bash
TAG=$(git rev-parse --short HEAD)
IMAGE="us-central1-docker.pkg.dev/$PROJECT/scouthosting/app:$TAG"
docker build -t "$IMAGE" .
docker push "$IMAGE"
```

### 3. Add the apex domain to Cloudflare

Sign in to Cloudflare → Add a Site → enter `compass.app` → pick the
free plan → follow Cloudflare's instructions to switch your registrar's
nameservers. Once status is "Active":

- Copy the **Zone ID** from the Overview page (right-side column)
- Create an **API Token**: My Profile → API Tokens → Create
  - Permissions: `Zone — DNS — Edit`, `Zone — Zone Settings — Edit`
  - Zone Resources: Include → Specific zone → `compass.app`

### 4. Create app secrets in Secret Manager

```bash
# RSVP token signing
echo -n "$(openssl rand -hex 32)" | \
  gcloud secrets create scouthosting-rsvp-secret --data-file=-

# Google OAuth client (https://console.cloud.google.com/apis/credentials)
echo -n "<your-google-oauth-client-id>" | \
  gcloud secrets create scouthosting-google-client-id --data-file=-
echo -n "<your-google-oauth-client-secret>" | \
  gcloud secrets create scouthosting-google-client-secret --data-file=-

# Resend (https://resend.com/api-keys)
echo -n "<your-resend-api-key>" | \
  gcloud secrets create scouthosting-resend-api-key --data-file=-
```

### 5. Apply the Terraform

```bash
cd infra/gcp
cp terraform.tfvars.example terraform.tfvars
# Fill in: project_id, image (from step 2),
#          cloudflare_api_token, cloudflare_zone_id (from step 3),
#          optionally alert_email + billing_account.

terraform init
terraform plan
terraform apply
```

This provisions:
- Cloud Run v2 service (the app)
- Cloud SQL Postgres 16 with PITR + a generated DATABASE_URL secret
- GCS bucket for uploads
- Cloudflare apex + wildcard CNAME → Cloud Run, proxied (orange cloud)
- Cloudflare zone settings: SSL=strict, HTTPS-only, TLS 1.2+
- Cloudflare Transform Rule injecting `X-Origin-Auth: <random>` on every
  proxied request
- Cloudflare rate-limit ruleset on auth + provisioning endpoints
- Cloudflare scanner-block ruleset (drops `/wp-admin`, `/.env`, `/.git/`, …)
- A random origin-auth secret in Secret Manager, mounted into Cloud Run
  as `ORIGIN_AUTH_SECRET`

### 6. Smoke test

```bash
# Apex through Cloudflare → marketing site
curl -s -o /dev/null -w '%{http_code}\n' https://compass.app/

# Demo tenant subdomain
curl -s -o /dev/null -w '%{http_code}\n' https://troop100.compass.app/

# Direct hit on Cloud Run should now be 403 (no X-Origin-Auth header)
curl -s -o /dev/null -w '%{http_code}\n' "$(terraform output -raw cloud_run_url)/"
```

The third one being 403 is the proof that Cloudflare is the only viable
path to the app.

## Why X-Origin-Auth?

Without something like it, anyone who learns your `*.run.app` URL
bypasses Cloudflare's WAF + rate limit by hitting Cloud Run directly.

The Transform Rule in `cloudflare.tf` injects a random secret header
on every proxied request. The Express middleware in
`lib/originAuth.js` constant-time compares it against
`ORIGIN_AUTH_SECRET` (read from Secret Manager). Mismatch or missing
header → 403. The secret is never logged and never crosses the boundary
in plaintext (`X-Origin-Auth` is set inside Cloudflare's pipeline; the
client never sees or sets it).

To rotate: `terraform taint random_password.origin_auth && terraform
apply`. Cloudflare and Cloud Run pick up the new value atomically.

## Subsequent deploys

### Manual one-off

```bash
scripts/deploy.sh                         # uses git short SHA
scripts/deploy.sh v2026-04-28             # explicit tag
```

### Automatic on every commit (Cloud Build)

The repo includes [`cloudbuild.yaml`](../cloudbuild.yaml). Wire a
trigger once:

```bash
gcloud builds triggers create github \
  --repo-name=scouthosting \
  --repo-owner=<your-github-org> \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml \
  --name=scouthosting-main \
  --region=us-central1
```

## Optional Terraform features

### Uptime monitoring + alert (`alert_email`)

Set `alert_email` to receive a notification when an HTTPS uptime check
on the apex fails for 2 minutes.

### Budget alert (`billing_account` + `monthly_budget_usd`)

Creates a billing budget at 50% / 90% / 100% of the monthly spend cap.
If `alert_email` is set, the budget overage notifies that channel too.

## Production readiness checklist

Before pointing real Scout-unit traffic at this:

- [ ] Domain added to Cloudflare; nameservers switched at the registrar;
      zone status = Active
- [ ] `cloudflare_api_token` scoped to **only** this zone (not all zones)
- [ ] `RESEND_API_KEY` verified with a test broadcast
- [ ] `MAIL_FROM` domain verified in Resend (DKIM + SPF passing in DNS)
- [ ] `RSVP_SECRET` and `AUTH_TOKEN_SECRET` set to fresh `openssl rand`
      values; **not** the dev defaults
- [ ] `GOOGLE_CLIENT_ID/SECRET` set with the production redirect URI
      (`https://<apex>/auth/google/callback`)
- [ ] `COOKIE_DOMAIN=.<apex_domain>` in Cloud Run env so apex sessions
      span subdomains
- [ ] `db_tier` upgraded from `db-f1-micro` to at least
      `db-custom-2-7680`, `availability_type = REGIONAL` for production
- [ ] `alert_email` set; test the uptime alert by stopping Cloud Run
      briefly
- [ ] `billing_account` set and `monthly_budget_usd` capped at a value
      you'd be comfortable with
- [ ] Terraform state in a remote GCS backend (versioned + uniform
      access) rather than local
- [ ] Cloud Build trigger wired so deploys go through CI
- [ ] **Confirm Cloud Run direct URL returns 403** — the X-Origin-Auth
      header is what makes Cloudflare the only path in
- [ ] First scrape of the public site through SSL Labs ≥ A grade
- [ ] Per-org backups verified by exporting via
      `pg_dump --table=... --where="orgId=..."`

## AWS module

`infra/aws/` is a one-page README placeholder. No Terraform code. Lands
when an enterprise/council customer specifically requires AWS.
