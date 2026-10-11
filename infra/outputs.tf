output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "sql_connection_name" {
  value = google_sql_database_instance.main.connection_name
}

output "environments" {
  value = { for k, env in module.environment : k => {
    api_service     = env.api_service
    api_url         = env.api_url
    migrate_job     = env.migrate_job
    runtime_sa      = env.runtime_service_account
    web_sites       = env.web_sites
    web_urls        = env.web_urls
    app_url         = env.app_url
    uploads_bucket  = env.uploads_bucket
    secrets_to_fill = env.secrets_to_fill
  } }
}

