output "load_balancer_ip" {
  description = "Point your DNS A record (apex + wildcard) at this IP."
  value       = google_compute_global_address.app.address
}

output "cloud_run_url" {
  description = "Direct Cloud Run URL (useful for smoke tests before DNS is set)."
  value       = google_cloud_run_v2_service.app.uri
}

output "cloud_sql_connection_name" {
  description = "PROJECT:REGION:INSTANCE — used by the Cloud SQL Auth Proxy."
  value       = google_sql_database_instance.pg.connection_name
}

output "uploads_bucket" {
  description = "GCS bucket name used for org photo uploads."
  value       = google_storage_bucket.uploads.name
}

output "service_account_email" {
  description = "Cloud Run runtime service account."
  value       = google_service_account.run.email
}
