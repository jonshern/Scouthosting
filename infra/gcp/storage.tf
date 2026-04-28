# GCS bucket for org-scoped photo uploads. Object key = "<orgId>/<filename>".

resource "google_storage_bucket" "uploads" {
  name                        = "${local.name}-uploads-${var.project_id}"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = var.env != "prod"

  versioning {
    enabled = false
  }

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  cors {
    origin          = ["https://${var.apex_domain}", "https://*.${var.apex_domain}"]
    method          = ["GET", "HEAD"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.apis]
}
