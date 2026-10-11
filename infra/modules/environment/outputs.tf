output "api_service" {
  value = google_cloud_run_v2_service.api.name
}

output "api_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "migrate_job" {
  value = google_cloud_run_v2_job.migrate.name
}

output "runtime_service_account" {
  value = google_service_account.runtime.email
}

output "web_sites" {
  description = "Firebase Hosting site per web app (Waypoint, Summit)."
  value       = { for app, site in google_firebase_hosting_site.web : app => site.site_id }
}

output "web_urls" {
  value = local.web_urls
}

output "uploads_bucket" {
  value = google_storage_bucket.uploads.name
}

output "secrets_to_fill" {
  description = "Secrets created with a placeholder that need a real value."
  value       = [for s in google_secret_manager_secret.manual : s.secret_id]
}

output "app_url" {
  description = "The server's own pages: sign-in, admin, RSVP and permission-slip links."
  value       = "https://${local.app_host}"
}
