# Copies of production data that don't live inside the database instance.
#
# Cloud SQL's own backups (daily, 14 kept, 7 days of point-in-time
# recovery; main.tf) belong to core-pg: they're the fast way back from a
# bad migration, but they share its region and go if the instance is
# deleted past its 30-day final backup. This file adds what the Mac
# already has (docs/runbooks-mac.md, "Backups"): a nightly copy kept
# somewhere else.
#
#   - core-backup-prod (Cloud Scheduler, 02:30 Central) asks Cloud SQL to
#     export compass_prod as a gzipped SQL dump to
#     gs://<project>-backups/compass_prod/compass_prod.sql.gz. The bucket
#     keeps versions, so each night's export replaces the last and the
#     older ones stay for var.backup_keep_days.
#   - core-uploads-prod (Storage Transfer) copies the prod uploads bucket
#     to uploads/ in the same bucket nightly. Photo bytes are already
#     encrypted with each unit's key.
#
# The bucket is in var.backup_region, not var.region. Restoring from it,
# and the monthly drill, are in docs/runbooks-gcp.md#restore-the-database.
# Everything here reads only prod; staging has no backups beyond core-pg's.

locals {
  backup_db = "compass_prod"
}

resource "google_storage_bucket" "backups" {
  name                        = "${var.project_id}-backups"
  location                    = upper(var.backup_region)
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  # Deleted or overwritten objects can be undeleted for this long, on top
  # of the noncurrent versions kept below.
  soft_delete_policy {
    retention_duration_seconds = 7 * 86400
  }

  lifecycle_rule {
    condition {
      days_since_noncurrent_time = var.backup_keep_days
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.apis]
}

# --- Nightly database export -------------------------------------------------

# Cloud SQL writes the export as its own service account.
resource "google_storage_bucket_iam_member" "sql_writes_backups" {
  bucket = google_storage_bucket.backups.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_sql_database_instance.main.service_account_email_address}"
}

# The scheduler's identity may start an export and nothing else: no
# connecting, no restoring, no settings.
resource "google_project_iam_custom_role" "sql_export" {
  role_id     = "coreSqlExport"
  title       = "Cloud SQL export (nightly backup)"
  permissions = ["cloudsql.instances.export", "cloudsql.instances.get"]
}

resource "google_service_account" "backup" {
  account_id   = "core-backup"
  display_name = "core nightly database export"
}

resource "google_project_iam_member" "backup_export" {
  project = var.project_id
  role    = google_project_iam_custom_role.sql_export.id
  member  = "serviceAccount:${google_service_account.backup.email}"
}

resource "google_cloud_scheduler_job" "db_export" {
  name      = "core-backup-prod"
  region    = var.region
  schedule  = var.backup_schedule
  time_zone = "America/Chicago"

  http_target {
    http_method = "POST"
    uri         = "https://sqladmin.googleapis.com/v1/projects/${var.project_id}/instances/${google_sql_database_instance.main.name}/export"
    headers = {
      "Content-Type" = "application/json"
    }
    body = base64encode(jsonencode({
      exportContext = {
        fileType  = "SQL"
        uri       = "gs://${google_storage_bucket.backups.name}/${local.backup_db}/${local.backup_db}.sql.gz"
        databases = [local.backup_db]
        offload   = false
      }
    }))

    oauth_token {
      service_account_email = google_service_account.backup.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  # Cloud SQL runs one operation at a time; a deploy's on-demand backup at
  # 02:30 makes the export wait for a retry.
  retry_config {
    retry_count          = 3
    min_backoff_duration = "300s"
  }

  depends_on = [
    google_project_iam_member.backup_export,
    google_storage_bucket_iam_member.sql_writes_backups,
    module.environment,
  ]
}

# --- Nightly copy of prod uploads ---------------------------------------------

data "google_storage_transfer_project_service_account" "this" {
  depends_on = [google_project_service.apis]
}

locals {
  transfer_sa = "serviceAccount:${data.google_storage_transfer_project_service_account.this.email}"
  transfer_grants = {
    "uploads-read"  = { bucket = local.prod.uploads_bucket, role = "roles/storage.objectViewer" }
    "uploads-list"  = { bucket = local.prod.uploads_bucket, role = "roles/storage.legacyBucketReader" }
    "backups-write" = { bucket = google_storage_bucket.backups.name, role = "roles/storage.objectAdmin" }
    "backups-list"  = { bucket = google_storage_bucket.backups.name, role = "roles/storage.legacyBucketReader" }
  }
}

resource "google_storage_bucket_iam_member" "transfer" {
  for_each = local.transfer_grants
  bucket   = each.value.bucket
  role     = each.value.role
  member   = local.transfer_sa
}

resource "google_storage_transfer_job" "uploads" {
  description = "core-uploads-prod: nightly copy of prod uploads to the backups bucket"

  transfer_spec {
    gcs_data_source {
      bucket_name = local.prod.uploads_bucket
    }
    gcs_data_sink {
      bucket_name = google_storage_bucket.backups.name
      path        = "uploads/"
    }
    # Never delete from the copy because something left the source: a
    # deleted photo stays here as a noncurrent version until
    # var.backup_keep_days have passed.
    transfer_options {
      delete_objects_unique_in_sink = false
    }
  }

  schedule {
    schedule_start_date {
      year  = 2026
      month = 1
      day   = 1
    }
    # 09:00 UTC is 03:00-04:00 Central, after the database export.
    start_time_of_day {
      hours   = 9
      minutes = 0
      seconds = 0
      nanos   = 0
    }
  }

  depends_on = [google_storage_bucket_iam_member.transfer]
}
