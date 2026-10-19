variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "environments" {
  description = "Environments sharing this project. Previews ride on staging."
  type = map(object({
    min_instances = number # 1 keeps prod warm (~$8-10/mo); 0 scales to zero
    max_instances = number
  }))
  default = {
    staging = { min_instances = 0, max_instances = 2 }
    prod    = { min_instances = 0, max_instances = 4 }
  }
}

variable "db_tier" {
  description = "Cloud SQL machine type. db-f1-micro (0.6 GB, ~$8/mo) to about 30 units; db-g1-small (1.7 GB, ~$26/mo) after that or when the memory alert fires; db-custom-1-3840 (dedicated core, SLA-covered, ~$50/mo) when customers need an SLA. infra/COSTS.md has the sums."
  type        = string
  default     = "db-f1-micro"
}

variable "mail_from" {
  description = "From address for outgoing mail (domain must be verified with the mail provider)."
  type        = string
  default     = "Compass <noreply@example.org>"
}

variable "cron_schedule" {
  description = "Cron (America/Chicago) for the server's housekeeping tick: scheduled newsletters, rules, retention."
  type        = string
  default     = "0 * * * *"
}

variable "app_domains" {
  description = "Optional custom host for the core service per environment, e.g. { prod = \"compass.example.org\" }. Each one gets a load balancer with a Google-managed certificate for the host and *.host, so units get <slug>.<host> (about $18/mo for up to five such hosts; modules/environment/edge.tf). The edge_dns output lists the DNS records to add."
  type        = map(string)
  default     = {}
}

variable "mail_drivers" {
  description = "Mail driver per environment: console (log only, the default) or resend once the Resend key is set, e.g. { prod = \"resend\" }."
  type        = map(string)
  default     = {}
}

variable "stripe_prices" {
  description = "Stripe Price IDs for the unit subscription per environment, e.g. { prod = { yearly = \"price_...\", monthly = \"price_...\" } }. Billing stays off where unset (docs/billing.md)."
  type        = map(object({ yearly = string, monthly = string }))
  default     = {}
}

variable "web_apps" {
  description = "Static web apps in the family that get a Firebase Hosting site per environment. Their repositories publish to them. landing is the family's one-page front door on the apex domain (bluecard marketing/landing/)."
  type        = list(string)
  default     = ["waypoint", "lantern", "landing"]
}

variable "site_prefix" {
  description = "Prefix for Firebase Hosting site IDs: <prefix>-<app> in prod, <prefix>-<app>-staging. Empty uses the project ID; set something shorter if site IDs get too long."
  type        = string
  default     = ""
}

variable "custom_domains" {
  description = "Optional custom domain per environment and web app, e.g. { prod = { waypoint = \"badges.example.org\" } }. Leave empty to use *.web.app."
  type        = map(map(string))
  default     = {}
}

variable "alert_email" {
  description = "Where production alerts go (outages, errors, database pressure, youth-protection refusals)."
  type        = string
}

variable "log_retention_days" {
  description = "How long Cloud Logging keeps logs. 30 is free; longer costs about 1 cent per GB-month."
  type        = number
  default     = 90
}

variable "monitored_web_apps" {
  description = "Web apps whose prod site gets an uptime check. Add each one after its first publish."
  type        = list(string)
  default     = []
}

variable "backup_region" {
  description = "Region of the backups bucket (nightly database export and a copy of prod uploads). Keep it away from var.region so one regional outage can't take both."
  type        = string
  default     = "us-east1"
}

variable "backup_schedule" {
  description = "Cron (America/Chicago) for the nightly prod database export. 02:30 matches the Mac."
  type        = string
  default     = "30 2 * * *"
}

variable "backup_keep_days" {
  description = "Days an export or a replaced/deleted upload copy stays in the backups bucket after a newer one replaces it. 30 matches the Mac."
  type        = number
  default     = 30
}
