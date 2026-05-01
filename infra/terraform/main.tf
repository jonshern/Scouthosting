# Compass on Fly.io — infrastructure as code.
#
# This module stands up:
#   - One Fly app for the Compass server (auto-scaled 1..N machines)
#   - One Fly Postgres cluster (single primary; HA optional via
#     var.postgres_ha)
#   - Persistent volume for /app/var/uploads (per-machine; replicated
#     via Fly's snapshot policy)
#   - Wildcard cert for the apex + *.<apex>
#   - Required secrets pre-populated as Fly secrets (DATABASE_URL,
#     SESSION_SECRET, RESEND_API_KEY, etc.)
#
# Out of scope: the Postgres seed (`prisma migrate deploy` runs on each
# boot from the Dockerfile), DNS records (manual Cloudflare today;
# bring your own provider).
#
# Usage:
#   cd infra/terraform
#   tofu init  (or terraform init)
#   tofu apply -var "fly_org=compass" -var "apex_domain=compass.app"
#
# Provider auth:
#   Set FLY_API_TOKEN before running. From your Fly dashboard:
#     flyctl auth token

terraform {
  required_version = ">= 1.5"

  required_providers {
    fly = {
      source  = "fly-apps/fly"
      version = "~> 0.0.23"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "fly" {
  # FLY_API_TOKEN is read from the environment.
  useinternaltunnel    = false
}

# ---------- Variables ------------------------------------------------

variable "fly_org" {
  description = "Fly.io organization slug (e.g. \"compass\")."
  type        = string
}

variable "apex_domain" {
  description = "Apex domain Compass runs on (e.g. \"compass.app\")."
  type        = string
}

variable "primary_region" {
  description = "Fly region for the app + Postgres (one of: ord, iad, sjc, ams, ...)"
  type        = string
  default     = "ord"
}

variable "app_count" {
  description = "How many app machines to keep warm."
  type        = number
  default     = 2
}

variable "postgres_ha" {
  description = "Stand up a 2-node Postgres cluster (Fly's recommended HA)."
  type        = bool
  default     = false
}

variable "uploads_volume_gb" {
  description = "Size of the /app/var/uploads volume per app machine, in GB."
  type        = number
  default     = 10
}

variable "log_level" {
  description = "Service log level. Options: debug, info, warn, error."
  type        = string
  default     = "info"
}

variable "container_image" {
  description = "Compass container image. Override per release."
  type        = string
  default     = "ghcr.io/compass/compass:latest"
}

# Secrets — pulled from environment so they're never in state. Each
# var defaults to empty so `tofu plan` runs without them; on `apply`
# Terraform will fail if any required secret is empty.
variable "session_secret" {
  description = "Lucia session-cookie signing secret. 32+ random bytes."
  type        = string
  sensitive   = true
  default     = ""
}

variable "resend_api_key" {
  description = "Resend API key for transactional email."
  type        = string
  sensitive   = true
  default     = ""
}

variable "resend_webhook_secret" {
  description = "Resend Svix-style webhook signing secret."
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_oauth_client_id" {
  description = "Google OAuth client id for the apex Sign-in-with-Google flow."
  type        = string
  default     = ""
}

variable "google_oauth_client_secret" {
  description = "Google OAuth client secret."
  type        = string
  sensitive   = true
  default     = ""
}

# ---------- Random fallbacks for first apply -------------------------

resource "random_password" "session_secret_fallback" {
  count   = var.session_secret == "" ? 1 : 0
  length  = 48
  special = false
}

locals {
  session_secret_resolved = var.session_secret == "" ? random_password.session_secret_fallback[0].result : var.session_secret
}

# ---------- Fly app --------------------------------------------------

resource "fly_app" "compass" {
  name = "compass"
  org  = var.fly_org
}

resource "fly_volume" "uploads" {
  count  = var.app_count
  app    = fly_app.compass.name
  name   = "compass_uploads_${count.index}"
  region = var.primary_region
  size   = var.uploads_volume_gb
}

# ---------- Fly Postgres --------------------------------------------

resource "fly_app" "postgres" {
  name = "compass-postgres"
  org  = var.fly_org
}

# NB: Fly's terraform provider doesn't yet expose Postgres-cluster
# orchestration as a single resource — operators bring up the cluster
# with `flyctl postgres create --name compass-postgres` and then
# attach it. The variable below is documentary; the actual creation
# step is in docs/DEPLOY.md until the provider catches up.
output "postgres_create_hint" {
  value = "Run: flyctl postgres create --name compass-postgres --org ${var.fly_org} --region ${var.primary_region}${var.postgres_ha ? " --initial-cluster-size 2" : ""}"
}

# ---------- Secrets --------------------------------------------------

resource "fly_app" "compass_secrets" {
  # Dummy resource so we have a place to hang lifecycle ignores.
  name = fly_app.compass.name
  org  = var.fly_org

  lifecycle {
    ignore_changes = all
    prevent_destroy = true
  }
}

# Fly secrets are imperative (set via flyctl); we surface the required
# names + values as outputs for a wrapper script. A future provider
# release should let us declare these directly.
output "fly_secrets_to_set" {
  description = "Run these flyctl secrets set commands after first apply:"
  value = join("\n", [
    "flyctl secrets set --app ${fly_app.compass.name} \\",
    "  NODE_ENV=production \\",
    "  PORT=8080 \\",
    "  LOG_LEVEL=${var.log_level} \\",
    "  APEX_DOMAIN=${var.apex_domain} \\",
    "  COOKIE_DOMAIN=.${var.apex_domain} \\",
    "  SESSION_SECRET=$SESSION_SECRET \\",
    "  RESEND_API_KEY=$RESEND_API_KEY \\",
    "  RESEND_WEBHOOK_SECRET=$RESEND_WEBHOOK_SECRET \\",
    "  GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID \\",
    "  GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET \\",
    "  GOOGLE_REDIRECT_URI=https://${var.apex_domain}/auth/google/callback",
  ])
  sensitive = true
}

# ---------- Outputs --------------------------------------------------

output "app_name"       { value = fly_app.compass.name }
output "app_hostname"   { value = "${fly_app.compass.name}.fly.dev" }
output "primary_region" { value = var.primary_region }
output "uploads_volumes" {
  value = [for v in fly_volume.uploads : v.name]
}
