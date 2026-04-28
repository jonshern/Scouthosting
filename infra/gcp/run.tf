# Cloud Run v2 service running the Scouthosting container.

resource "google_cloud_run_v2_service" "app" {
  name     = "${local.name}-app"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL" # Locked down at the LB layer.

  template {
    service_account = google_service_account.run.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.pg.connection_name]
      }
    }

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      ports {
        container_port = 8080
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "APEX_DOMAIN"
        value = var.apex_domain
      }
      env {
        name  = "COOKIE_DOMAIN"
        value = ".${var.apex_domain}"
      }
      env {
        name  = "STORAGE_DRIVER"
        value = "gcs"
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.uploads.name
      }
      env {
        name  = "GOOGLE_REDIRECT_URI"
        value = "https://${var.apex_domain}/auth/google/callback"
      }
      env {
        name  = "MAIL_DRIVER"
        value = var.mail_driver
      }
      env {
        name  = "MAIL_FROM"
        value = var.mail_from
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_url.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "RSVP_SECRET"
        value_source {
          secret_key_ref {
            secret  = var.secret_names.rsvp
            version = "latest"
          }
        }
      }
      env {
        name = "GOOGLE_CLIENT_ID"
        value_source {
          secret_key_ref {
            secret  = var.secret_names.google_id
            version = "latest"
          }
        }
      }
      env {
        name = "GOOGLE_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = var.secret_names.google_secret
            version = "latest"
          }
        }
      }
      env {
        name = "RESEND_API_KEY"
        value_source {
          secret_key_ref {
            secret  = var.secret_names.resend_api_key
            version = "latest"
          }
        }
      }
      env {
        name = "ORIGIN_AUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.origin_auth.secret_id
            version = "latest"
          }
        }
      }

      startup_probe {
        http_get {
          path = "/api/auth/providers"
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        timeout_seconds       = 3
        failure_threshold     = 24
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.rsvp_access,
    google_secret_manager_secret_iam_member.db_url_access,
  ]
}

# Allow unauthenticated invocations — the app handles its own auth.
resource "google_cloud_run_v2_service_iam_member" "public" {
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
