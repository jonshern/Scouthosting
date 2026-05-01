# Compass · infrastructure as code

Terraform / OpenTofu module for standing up Compass on Fly.io.

## What this gives you

- One Fly app (`compass`) running the multi-stage Dockerfile from the
  repo root.
- One Fly Postgres app (`compass-postgres`).
- One persistent volume per app machine for `/app/var/uploads`.
- A wrapper command for setting all required Fly secrets.

## What this doesn't give you

- **DNS records.** Bring your own provider. Point `compass.app` and
  `*.compass.app` at the app's anycast IP (use `flyctl ips list`).
- **Wildcard cert.** Issue via Fly: `flyctl certs add "*.compass.app"`
  and follow Fly's CNAME instructions. Repeat for the apex.
- **First-time Postgres provisioning.** Until Fly's terraform
  provider exposes Postgres-cluster orchestration as a single
  resource, run the printed command from `output.postgres_create_hint`
  manually after the first `apply`.

## Usage

```bash
cd infra/terraform
export FLY_API_TOKEN=$(flyctl auth token)

# First-time secrets (export before apply so they don't end up in state):
export TF_VAR_session_secret=$(openssl rand -base64 36)
export TF_VAR_resend_api_key=re_...
export TF_VAR_resend_webhook_secret=whsec_...
export TF_VAR_google_oauth_client_id=...
export TF_VAR_google_oauth_client_secret=...

tofu init
tofu apply \
  -var "fly_org=compass" \
  -var "apex_domain=compass.app" \
  -var "primary_region=ord" \
  -var "app_count=2"
```

Then run the printed `flyctl secrets set` command, push your
container, and run `flyctl deploy`.

## Variables (all optional except `fly_org` + `apex_domain`)

| Var | Default | Notes |
| --- | --- | --- |
| `fly_org` | required | Fly organization slug. |
| `apex_domain` | required | e.g. `compass.app`. |
| `primary_region` | `ord` | Single Fly region. Add a region by spinning up an extra app machine via `flyctl scale count`. |
| `app_count` | `2` | Warm machines. Each gets its own uploads volume. |
| `postgres_ha` | `false` | Pass `true` to print the HA-cluster create hint. |
| `uploads_volume_gb` | `10` | Per-machine. Bump if a unit's photo library is large. |
| `log_level` | `info` | Service log filter. |
| `container_image` | `ghcr.io/compass/compass:latest` | Override per release. |

## State

Default state is local (`terraform.tfstate`). For team use, configure
a remote backend (S3, GCS, or Terraform Cloud). The module doesn't
mandate one — operators choose.

## Cloud Run / ECS variants

Same Dockerfile, different IaC. The runtime environment variables in
`output.fly_secrets_to_set` map 1:1 to whatever your platform
expects. See `docs/DEPLOY.md` for the command-line equivalents.
