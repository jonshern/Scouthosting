variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "Primary region for Cloud Run, Cloud SQL, GCS, and the LB."
  type        = string
  default     = "us-central1"
}

variable "env" {
  description = "Environment label (prod, staging, dev)."
  type        = string
  default     = "prod"
}

variable "apex_domain" {
  description = "Apex domain. Subdomains like <slug>.<apex_domain> are tenant sites."
  type        = string
  default     = "scouthosting.com"
}

variable "image" {
  description = "Container image URL (e.g. us-central1-docker.pkg.dev/<project>/scouthosting/app:tag). Push it before applying."
  type        = string
}

variable "db_tier" {
  description = "Cloud SQL machine tier. db-f1-micro is the cheapest; db-custom-2-7680 is a sane prod default."
  type        = string
  default     = "db-f1-micro"
}

variable "min_instances" {
  description = "Cloud Run min instances. 0 = scale to zero (cheap, cold starts)."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Cloud Run max instances."
  type        = number
  default     = 10
}

# Mail / OAuth secrets are NOT created by Terraform — they're written to
# Secret Manager out of band and referenced here. See infra/README.md.
variable "secret_names" {
  description = "Secret Manager secret names referenced by Cloud Run."
  type = object({
    rsvp           = string
    google_id      = string
    google_secret  = string
    resend_api_key = string
  })
  default = {
    rsvp           = "scouthosting-rsvp-secret"
    google_id      = "scouthosting-google-client-id"
    google_secret  = "scouthosting-google-client-secret"
    resend_api_key = "scouthosting-resend-api-key"
  }
}

variable "mail_driver" {
  description = "Mail driver. \"console\" logs only; \"resend\" sends via Resend; \"smtp\" via Nodemailer."
  type        = string
  default     = "resend"
}

variable "mail_from" {
  description = "From: header on outbound mail. Domain should be verified in your mail provider."
  type        = string
  default     = "Scouthosting <noreply@scouthosting.com>"
}

# ---------------------------------------------------------------------------
# Cloudflare — replaces the GCP HTTPS load balancer
# ---------------------------------------------------------------------------

variable "cloudflare_api_token" {
  description = "Cloudflare API token (Edit zone DNS + Edit zone settings on the apex zone)."
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for apex_domain. Find it on the Overview page of the zone."
  type        = string
}
