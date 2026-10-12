# Shared, project-level pieces. Per-environment pieces live in
# modules/environment and are stamped out once per entry in var.environments.

locals {
  apis = [
    "artifactregistry.googleapis.com",
    "cloudscheduler.googleapis.com",
    "firebase.googleapis.com",
    "firebasehosting.googleapis.com",
    "iam.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.apis)
  service            = each.value
  disable_on_destroy = false
}

# --- Container images --------------------------------------------------------

resource "google_artifact_registry_repository" "images" {
  repository_id = "core"
  format        = "DOCKER"
  location      = var.region
  description   = "Core service images (Compass; one tag per git SHA)"

  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 15
    }
  }

  cleanup_policies {
    id     = "drop-old"
    action = "DELETE"
    condition {
      older_than = "2592000s" # 30 days
    }
  }

  depends_on = [google_project_service.apis]
}

# --- Postgres ----------------------------------------------------------------
# One small instance for the whole family; each environment gets its own
# database and logins on it.
# Cloud Run reaches it over the built-in Cloud SQL connector (unix socket),
# so there is no VPC, no authorized networks and no proxy to run.

resource "google_sql_database_instance" "main" {
  name             = "core-pg"
  database_version = "POSTGRES_17"
  region           = var.region

  deletion_protection = true

  settings {
    tier                        = var.db_tier
    deletion_protection_enabled = true # also blocks deletes from the console and gcloud
    retain_backups_on_delete    = true
    connector_enforcement       = "REQUIRED" # only IAM-checked connectors (Cloud Run) can connect
    edition                     = "ENTERPRISE"
    availability_type           = "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = 10
    disk_autoresize             = true

    backup_configuration {
      enabled                        = true
      start_time                     = "08:00" # 3am Central
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 14
      }
    }

    ip_configuration {
      ipv4_enabled = true # reachable only via IAM-authorized connector; no networks allowed
      ssl_mode     = "ENCRYPTED_ONLY"
    }

    # If the instance is ever deleted, keep one last backup for 30 days.
    final_backup_config {
      enabled        = true
      retention_days = 30
    }

    maintenance_window {
      day  = 2 # Tuesday
      hour = 9
    }

    insights_config {
      query_insights_enabled = true
    }

    database_flags {
      name  = "max_connections"
      value = "50"
    }

    # Log slow queries and every failed statement (youth-protection refusals
    # show up here and feed an alert in monitoring.tf).
    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }

    database_flags {
      name  = "log_min_error_statement"
      value = "error"
    }
  }

  depends_on = [google_project_service.apis]
}

# --- Firebase (web hosting for Waypoint and Lantern) --------------------------

resource "google_firebase_project" "this" {
  provider   = google-beta
  project    = var.project_id
  depends_on = [google_project_service.apis]
}

# --- Environments ------------------------------------------------------------

module "environment" {
  source   = "./modules/environment"
  for_each = var.environments

  providers = {
    google      = google
    google-beta = google-beta
  }

  name           = each.key
  project_id     = var.project_id
  region         = var.region
  min_instances  = each.value.min_instances
  max_instances  = each.value.max_instances
  sql_instance   = google_sql_database_instance.main
  mail_from      = var.mail_from
  mail_driver    = lookup(var.mail_drivers, each.key, "console")
  cron_schedule  = var.cron_schedule
  app_domain     = lookup(var.app_domains, each.key, "")
  web_apps       = var.web_apps
  site_prefix    = var.site_prefix != "" ? var.site_prefix : var.project_id
  custom_domains = lookup(var.custom_domains, each.key, {})

  depends_on = [google_firebase_project.this, google_project_service.apis]
}
