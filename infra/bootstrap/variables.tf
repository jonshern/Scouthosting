variable "project_id" {
  description = "GCP project that hosts the family: Compass, Waypoint and Lantern (create it and link billing first)."
  type        = string
}

variable "region" {
  description = "Default region. us-central1 is the cheapest and is required for Firebase Hosting -> Cloud Run rewrites in this setup."
  type        = string
  default     = "us-central1"
}

variable "github_repository" {
  description = "owner/name of the core repository, whose workflows deploy the service and run Terraform."
  type        = string
  default     = "jonshern/Scouthosting"
}

variable "billing_account_id" {
  description = "Billing account ID (XXXXXX-XXXXXX-XXXXXX) for the budget alert. Empty skips the budget."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Alert when spend crosses 50%, 90% and (forecast) 100% of this."
  type        = number
  default     = 25
}

variable "web_repositories" {
  description = "owner/name of the web apps' repositories; they may only publish to Firebase Hosting."
  type        = list(string)
  default     = ["jonshern/bluecard", "jonshern/emmett-scouting"]
}
