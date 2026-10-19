locals {
  # The family's one core service: Compass's app is both the troop site and
  # the API Waypoint and Lantern call.
  service = "core-${var.name}"
  # Cloud Run's placeholder until the first CI deploy pushes a real image.
  bootstrap_image = "us-docker.pkg.dev/cloudrun/container/hello"

  # Cloud Run's deterministic URL, known before the service exists, so the
  # server can be told its own host name (Compass routes by Host header).
  app_host = var.app_domain != "" ? var.app_domain : "${local.service}-${data.google_project.this.number}.${var.region}.run.app"

  common_env = merge({
    APP_ENV        = var.name
    APEX_HOST      = local.app_host
    APEX_DOMAIN    = local.app_host
    STORAGE_DRIVER = "gcs"
    GCS_BUCKET     = google_storage_bucket.uploads.name
    # "console" logs mail instead of sending it. Switch to "resend" with
    # var.mail_driver once the Resend key is in Secret Manager.
    MAIL_DRIVER = var.mail_driver
    MAIL_FROM   = var.mail_from
    # Billing stays off until these and the Stripe secrets below are real.
    STRIPE_PRICE_YEARLY  = var.stripe_prices.yearly
    STRIPE_PRICE_MONTHLY = var.stripe_prices.monthly
    SMS_DRIVER           = "console" # no SMS: youth protection rules out texting scouts
    PUSH_DRIVER          = "console"
    JOBS_DISABLED        = "1" # jobs run inside the request; no always-on worker to pay for
    LOG_LEVEL            = "info"
    # Cloud Run appends the caller's IP as the last X-Forwarded-For hop;
    # Compass's rate limits trust only that one.
    CLIENT_IP_HEADER   = "x-forwarded-for"
    CLIENT_IP_XFF_HOPS = "1"
    # Google and Apple send people back to <host>/api/auth/callback/<provider>
    # on whichever of these hosts they started (Compass and the websites
    # below); register each on the OAuth client (docs/sign-in-providers.md).
    # Waypoint's and Lantern's websites sign in through Compass and get the
    # token back at <origin>/signed-in; only these exact origins may.
    WEB_SIGNIN_ORIGINS = join(",", values(local.web_urls))
    }, var.name == "prod" ? {} : {
    DISABLE_INVITE_GATE = "1"
    # Staging only: lets test admins in without setting up two-step.
    ALLOW_ADMIN_WITHOUT_MFA = "1"
  })

  # Generated once by Terraform. MASTER_KEY encrypts member PII and photos
  # and must never change (see master_key below).
  generated_secrets = {
    SESSION_SECRET     = "session-secret"
    BETTER_AUTH_SECRET = "better-auth-secret"
    RSVP_SECRET        = "rsvp-secret"
    UNSUB_SECRET       = "unsub-secret"
    INVITE_SECRET      = "invite-secret"
    AUTH_TOKEN_SECRET  = "auth-token-secret"
    PERM_SLIP_SECRET   = "perm-slip-secret"
    TASKS_TOKEN        = "tasks-token"
    # The load balancer sends it as X-Compass-Edge (edge.tf); harmless
    # without one.
    CLIENT_IP_EDGE_TOKEN = "edge-token"
  }

  # Created with a placeholder; set the real value by hand (runbooks.md).
  manual_secrets = {
    RESEND_API_KEY        = "resend-api-key"
    RESEND_WEBHOOK_SECRET = "resend-webhook-secret"
    # Google sign-in: admins must use SSO in production. Apple is optional
    # and can be added the same way.
    GOOGLE_CLIENT_ID     = "google-client-id"
    GOOGLE_CLIENT_SECRET = "google-client-secret"
    # Unit subscriptions (docs/billing.md).
    STRIPE_SECRET_KEY     = "stripe-secret-key"
    STRIPE_WEBHOOK_SECRET = "stripe-webhook-secret"
  }

  secret_env = merge(
    { DATABASE_URL = google_secret_manager_secret.database_url.secret_id },
    { MASTER_KEY = google_secret_manager_secret.master_key.secret_id },
    { for env, id in local.generated_secrets : env => google_secret_manager_secret.generated[env].secret_id },
    { for env, id in local.manual_secrets : env => google_secret_manager_secret.manual[env].secret_id },
  )

  # Waypoint and Lantern's websites, one Firebase Hosting site each. Their
  # own repositories build and publish to these (scripts/deploy-web.sh there).
  web_sites = { for app in var.web_apps : app => var.name == "prod" ? "${var.site_prefix}-${app}" : "${var.site_prefix}-${app}-${var.name}" }
  web_urls = { for app, site in local.web_sites :
    app => lookup(var.custom_domains, app, "") != "" ? "https://${var.custom_domains[app]}" : "https://${site}.web.app"
  }
}

data "google_project" "this" {
  project_id = var.project_id
}

# --- Identity ----------------------------------------------------------------

resource "google_service_account" "runtime" {
  account_id   = "core-${var.name}"
  display_name = "core runtime (${var.name})"
}

resource "google_project_iam_member" "runtime_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# Needed to mint signed upload/download URLs for the uploads bucket.
resource "google_service_account_iam_member" "runtime_sign_blobs" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.runtime.email}"
}

# --- Database ----------------------------------------------------------------

resource "google_sql_database" "app" {
  name     = "compass_${var.name}"
  instance = var.sql_instance.name
}

# Two logins: the migrate job owns the schema; the API gets read/write on
# rows only, so a bug or a stolen API credential cannot drop tables or
# switch off the youth-protection triggers.
resource "random_password" "db_owner" {
  length  = 32
  special = false
}

resource "google_sql_user" "owner" {
  name     = "compass_${var.name}"
  instance = var.sql_instance.name
  password = random_password.db_owner.result
}

resource "random_password" "db_app" {
  length  = 32
  special = false
}

resource "google_sql_user" "app" {
  name     = "compass_${var.name}_app"
  instance = var.sql_instance.name
  password = random_password.db_app.result
}

# --- Secrets -----------------------------------------------------------------
# Generated secrets get a version here. Manual ones start as a placeholder;
# add the real value once with, for example:
#   printf '%s' "$KEY" | gcloud secrets versions add core-<env>-resend-api-key --data-file=-

resource "google_secret_manager_secret" "database_url" {
  secret_id = "core-${var.name}-database-url"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://${google_sql_user.app.name}:${random_password.db_app.result}@localhost/${google_sql_database.app.name}?host=/cloudsql/${var.sql_instance.connection_name}"
}

resource "google_secret_manager_secret" "migrate_database_url" {
  secret_id = "core-${var.name}-migrate-database-url"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "migrate_database_url" {
  secret      = google_secret_manager_secret.migrate_database_url.id
  secret_data = "postgresql://${google_sql_user.owner.name}:${random_password.db_owner.result}@localhost/${google_sql_database.app.name}?host=/cloudsql/${var.sql_instance.connection_name}"
}

resource "google_secret_manager_secret_iam_member" "migrate" {
  secret_id = google_secret_manager_secret.migrate_database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migrate.email}"
}

resource "random_id" "generated" {
  for_each    = local.generated_secrets
  byte_length = 32
}

resource "google_secret_manager_secret" "generated" {
  for_each  = local.generated_secrets
  secret_id = "core-${var.name}-${each.value}"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "generated" {
  for_each    = local.generated_secrets
  secret      = google_secret_manager_secret.generated[each.key].id
  secret_data = random_id.generated[each.key].hex
}

# Losing or changing this key makes encrypted member data unreadable, so
# Terraform refuses to destroy or replace it.
resource "random_id" "master_key" {
  byte_length = 32
  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret" "master_key" {
  secret_id = "core-${var.name}-master-key"
  replication {
    auto {}
  }
  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret_version" "master_key" {
  secret      = google_secret_manager_secret.master_key.id
  secret_data = random_id.master_key.hex
  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret" "manual" {
  for_each  = local.manual_secrets
  secret_id = "core-${var.name}-${each.value}"
  replication {
    auto {}
  }
}

# Cloud Run refuses to start if a referenced secret has no version, so seed a
# random placeholder: nothing can be signed or verified with a value nobody
# knows, and mail stays on the console driver until var.mail_driver changes.
resource "random_id" "manual_placeholder" {
  for_each    = local.manual_secrets
  byte_length = 16
}

resource "google_secret_manager_secret_version" "manual_placeholder" {
  for_each    = local.manual_secrets
  secret      = google_secret_manager_secret.manual[each.key].id
  secret_data = "unset-${random_id.manual_placeholder[each.key].hex}"
  lifecycle {
    ignore_changes = [secret_data, enabled]
  }
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each  = local.secret_env
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
  depends_on = [
    google_secret_manager_secret.database_url,
    google_secret_manager_secret.master_key,
    google_secret_manager_secret.generated,
    google_secret_manager_secret.manual,
  ]
}

# --- Uploads (photos, paperwork) ---------------------------------------------
# Private bucket; the server encrypts photo bytes and hands out short-lived
# signed URLs.

resource "google_storage_bucket" "uploads" {
  name                        = "${var.project_id}-${var.name}-uploads"
  location                    = upper(var.region)
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = var.name != "prod"

  versioning {
    enabled = var.name == "prod"
  }

  cors {
    origin          = concat(["https://${local.app_host}", "http://localhost:8081"], values(local.web_urls))
    method          = ["GET", "PUT"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }
}

resource "google_storage_bucket_iam_member" "runtime_uploads" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

# --- API service -------------------------------------------------------------

resource "google_cloud_run_v2_service" "api" {
  name                = local.service
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = var.name == "prod"

  template {
    service_account                  = google_service_account.runtime.email
    max_instance_request_concurrency = 80
    timeout                          = "60s"

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [var.sql_instance.connection_name]
      }
    }

    containers {
      image = local.bootstrap_image
      # The image's CMD starts Next only (no npm in the image, no migrate on
      # boot); the migrate job applies migrations with the owner login.

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle          = true # only billed while handling requests
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = local.common_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      # TCP, not HTTP: the port opening means Next is up, and no Compass
      # route (or its invite gate) has to be patched for a probe.
      startup_probe {
        tcp_socket {
          port = 3000
        }
        period_seconds    = 2
        failure_threshold = 15
      }
    }
  }

  # CI owns the running image (and the revision tags it adds for PR
  # previews); Terraform owns everything else.
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      template[0].revision,
      template[0].labels,
      client,
      client_version,
      traffic,
    ]
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime, google_project_iam_member.runtime_sql]
}

# Public: troop sites and event sign-up pages work without an account.
# Authorization happens in the app (sessions and bearer tokens), not at the
# Cloud Run edge.
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --- Migrations --------------------------------------------------------------
# Same image, different command. CI executes this job and waits for it before
# shifting traffic, so a bad migration never takes the live site down (the
# server never migrates on boot, so migrations can't tangle with health checks).

resource "google_service_account" "migrate" {
  account_id   = "core-${var.name}-migrate"
  display_name = "core migrations (${var.name})"
}

resource "google_project_iam_member" "migrate_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.migrate.email}"
}

resource "google_cloud_run_v2_job" "migrate" {
  name                = "core-migrate-${var.name}"
  location            = var.region
  deletion_protection = false

  template {
    task_count = 1
    template {
      service_account = google_service_account.migrate.email
      max_retries     = 0
      timeout         = "300s"

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [var.sql_instance.connection_name]
        }
      }

      containers {
        image   = local.bootstrap_image
        command = ["sh", "scripts/migrate.sh"]

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.migrate_database_url.secret_id
              version = "latest"
            }
          }
        }

        # The migrate runner grants the API's login row-level access.
        env {
          name  = "APP_DB_ROLE"
          value = google_sql_user.app.name
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [google_secret_manager_secret_iam_member.migrate, google_project_iam_member.migrate_sql]
}

# --- Scheduled work ----------------------------------------------------------
# Hourly tick: scheduled newsletters and rules, retention cleanup.

resource "google_cloud_scheduler_job" "cron" {
  name      = "core-cron-${var.name}"
  region    = var.region
  schedule  = var.cron_schedule
  time_zone = "America/Chicago"
  paused    = var.name != "prod"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.api.uri}/api/cron/run"
    headers = {
      "X-Tasks-Token" = random_id.generated["TASKS_TOKEN"].hex
    }
  }

  retry_config {
    retry_count = 2
  }
}

# --- Web hosting (Waypoint, Lantern) -----------------------------------------
# Each site rewrites /api/** to this service in its own firebase.json.

resource "google_firebase_hosting_site" "web" {
  provider = google-beta
  for_each = local.web_sites
  project  = var.project_id
  site_id  = each.value
}

resource "google_firebase_hosting_custom_domain" "web" {
  provider              = google-beta
  for_each              = { for app, site in local.web_sites : app => site if lookup(var.custom_domains, app, "") != "" }
  project               = var.project_id
  site_id               = google_firebase_hosting_site.web[each.key].site_id
  custom_domain         = var.custom_domains[each.key]
  wait_dns_verification = false
}
