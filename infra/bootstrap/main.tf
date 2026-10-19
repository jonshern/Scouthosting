# One-time bootstrap, run by a human with `gcloud auth application-default login`.
#
# Creates the three things CI cannot create for itself:
#   1. the GCS bucket that holds Terraform state for ../ (the main stack)
#   2. keyless GitHub Actions auth (Workload Identity Federation)
#   3. the service accounts GitHub Actions deploys as: one for this
#      repository (everything), one for the web apps' repositories
#      (Waypoint, Lantern), which can only publish to Firebase Hosting
# plus an optional monthly budget alert.
#
# State for this stack stays local (terraform.tfstate here, gitignored).
# It holds no secrets; if lost, `terraform import` the few resources back.

terraform {
  required_version = ">= 1.9"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.6"
    }
  }
}

provider "google" {
  project               = var.project_id
  region                = var.region
  billing_project       = var.project_id
  user_project_override = true
}

locals {
  bootstrap_apis = [
    "billingbudgets.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
  ]

  # What Terraform (run from GitHub Actions) needs to manage ../ and what the
  # deploy workflows need to roll out new images. Explicit rather than
  # roles/owner so the CI identity cannot, say, delete the project.
  deployer_roles = [
    "roles/artifactregistry.admin",
    "roles/certificatemanager.owner",
    "roles/cloudscheduler.admin",
    "roles/cloudsql.admin",
    "roles/compute.loadBalancerAdmin",
    "roles/firebase.admin",
    "roles/firebasehosting.admin",
    "roles/iam.roleAdmin",
    "roles/iam.serviceAccountAdmin",
    "roles/iam.serviceAccountUser",
    "roles/logging.configWriter",
    "roles/monitoring.editor",
    "roles/resourcemanager.projectIamAdmin",
    "roles/run.admin",
    "roles/secretmanager.admin",
    "roles/serviceusage.serviceUsageAdmin",
    "roles/storage.admin",
    "roles/storagetransfer.admin",
  ]
}

resource "google_project_service" "bootstrap" {
  for_each           = toset(local.bootstrap_apis)
  service            = each.value
  disable_on_destroy = false
}

# --- Terraform state ---------------------------------------------------------

resource "google_storage_bucket" "tfstate" {
  name                        = "${var.project_id}-tfstate"
  location                    = upper(var.region) == "US-CENTRAL1" ? "US" : var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 20
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.bootstrap]
}

# --- GitHub Actions identity -------------------------------------------------

resource "google_service_account" "deployer" {
  account_id   = "github-deployer"
  display_name = "GitHub Actions deployer (${var.github_repository})"
  depends_on   = [google_project_service.bootstrap]
}

resource "google_project_iam_member" "deployer" {
  for_each = toset(local.deployer_roles)
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_storage_bucket_iam_member" "deployer_state" {
  bucket = google_storage_bucket.tfstate.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.bootstrap]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
    "attribute.ref"              = "assertion.ref"
  }

  # Only workflows in the family's repositories can exchange a token; which
  # service account each may use is decided below.
  attribute_condition = "assertion.repository in ${jsonencode(concat([var.github_repository], var.web_repositories))}"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_impersonates_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# Waypoint's and Lantern's repositories publish their websites and nothing
# else: no Cloud Run, database, secrets or Terraform state.
resource "google_service_account" "web_deployer" {
  account_id   = "github-web-deployer"
  display_name = "GitHub Actions web publisher (Waypoint, Lantern)"
  depends_on   = [google_project_service.bootstrap]
}

resource "google_project_iam_member" "web_deployer" {
  for_each = toset(["roles/firebasehosting.admin", "roles/serviceusage.serviceUsageConsumer"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.web_deployer.email}"
}

resource "google_service_account_iam_member" "web_repos_impersonate_web_deployer" {
  for_each           = toset(var.web_repositories)
  service_account_id = google_service_account.web_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${each.value}"
}

# --- Budget alert (optional) -------------------------------------------------

data "google_project" "this" {
  project_id = var.project_id
}

resource "google_billing_budget" "monthly" {
  count           = var.billing_account_id == "" ? 0 : 1
  billing_account = var.billing_account_id
  display_name    = "scouting family monthly"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_budget_usd)
    }
  }

  # Emails go to the billing account's admins (Jon) by default.
  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  depends_on = [google_project_service.bootstrap]
}
