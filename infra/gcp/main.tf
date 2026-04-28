locals {
  name = "scouthosting-${var.env}"
}

# ---------------------------------------------------------------------------
# Required APIs
# ---------------------------------------------------------------------------

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "vpcaccess.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "servicenetworking.googleapis.com",
    "monitoring.googleapis.com",
    "billingbudgets.googleapis.com",
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ---------------------------------------------------------------------------
# Service account that the Cloud Run service runs as
# ---------------------------------------------------------------------------

resource "google_service_account" "run" {
  account_id   = "${local.name}-run"
  display_name = "Scouthosting Cloud Run runtime"
}

# Allow the runtime SA to read each app secret.
resource "google_secret_manager_secret_iam_member" "rsvp_access" {
  for_each = toset([
    var.secret_names.rsvp,
    var.secret_names.google_id,
    var.secret_names.google_secret,
    var.secret_names.resend_api_key,
  ])
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
  depends_on = [google_project_service.apis]
}

# Read/write the uploads bucket.
resource "google_storage_bucket_iam_member" "uploads_rw" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.run.email}"
}

# Connect to Cloud SQL.
resource "google_project_iam_member" "cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.run.email}"
}
