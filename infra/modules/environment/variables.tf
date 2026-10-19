variable "name" {
  description = "Environment name: staging or prod."
  type        = string
}

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "min_instances" {
  type = number
}

variable "max_instances" {
  type = number
}

variable "sql_instance" {
  description = "The shared google_sql_database_instance."
  type = object({
    name            = string
    connection_name = string
  })
}

variable "mail_from" {
  type = string
}

variable "cron_schedule" {
  type = string
}

variable "mail_driver" {
  description = "console logs mail; resend sends it (needs the Resend key in Secret Manager)."
  type        = string
  default     = "console"
}

variable "stripe_prices" {
  description = "Stripe Price IDs for the unit subscription; empty keeps billing off."
  type        = object({ yearly = string, monthly = string })
  default     = { yearly = "", monthly = "" }
}

variable "web_apps" {
  description = "Static web apps that get a Firebase Hosting site, e.g. [\"waypoint\", \"lantern\"]."
  type        = list(string)
  default     = []
}

variable "site_prefix" {
  description = "Prefix for Firebase Hosting site IDs (<prefix>-<app>[-<env>])."
  type        = string
}

variable "custom_domains" {
  description = "Optional custom domain per web app, e.g. { waypoint = \"badges.example.org\" }."
  type        = map(string)
  default     = {}
}

variable "app_domain" {
  description = "Optional custom host for the server's own pages (admin, sign-in, RSVP links) and units' <slug>.<host> sites, served through a load balancer (edge.tf). Empty uses the run.app URL."
  type        = string
  default     = ""
}
