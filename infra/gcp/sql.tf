# Cloud SQL Postgres + an app database and user. The DATABASE_URL secret
# is written by Terraform from the generated password; Cloud Run reads it
# at boot.

resource "google_sql_database_instance" "pg" {
  name                = "${local.name}-pg"
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = var.env == "prod"

  settings {
    tier              = var.db_tier
    availability_type = var.env == "prod" ? "REGIONAL" : "ZONAL"
    disk_size         = 20
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
    }

    insights_config {
      query_insights_enabled  = true
      record_application_tags = false
      record_client_address   = false
    }

    # Public IP path with the Cloud SQL Auth Proxy / connector instead of
    # opening to the internet. Cloud Run reaches the DB via the Auth Proxy
    # connection string set on DATABASE_URL below.
    ip_configuration {
      ipv4_enabled    = true
      ssl_mode        = "ENCRYPTED_ONLY"
      require_ssl     = true
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "app" {
  name     = "scouthosting"
  instance = google_sql_database_instance.pg.name
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_user" "app" {
  name     = "scouthosting"
  instance = google_sql_database_instance.pg.name
  password = random_password.db.result
}

# DATABASE_URL secret. Uses the Cloud SQL connector hostname (the unix
# socket Cloud Run mounts based on the connection name).
resource "google_secret_manager_secret" "db_url" {
  secret_id = "${local.name}-database-url"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "db_url" {
  secret = google_secret_manager_secret.db_url.id
  secret_data = format(
    "postgresql://%s:%s@localhost/%s?host=/cloudsql/%s&sslmode=disable",
    google_sql_user.app.name,
    google_sql_user.app.password,
    google_sql_database.app.name,
    google_sql_database_instance.pg.connection_name,
  )
}

resource "google_secret_manager_secret_iam_member" "db_url_access" {
  secret_id = google_secret_manager_secret.db_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}
