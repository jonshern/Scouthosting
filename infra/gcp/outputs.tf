output "cloud_run_url" {
  description = "Direct Cloud Run URL — useful for smoke testing before Cloudflare DNS propagates."
  value       = google_cloud_run_v2_service.app.uri
}

output "cloud_run_host" {
  description = "Bare *.run.app hostname used as the Cloudflare CNAME target."
  value       = local.cloud_run_host
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

output "next_steps" {
  description = "Things to verify after `terraform apply`."
  value = <<-EOT
    1. Confirm DNS in Cloudflare: ${var.apex_domain} and *.${var.apex_domain} should
       both be CNAMEs (proxied = orange cloud) targeting ${local.cloud_run_host}.
    2. Try the apex first: https://${var.apex_domain}/  (should hit the marketing site).
    3. Try the demo tenant: https://troop100.${var.apex_domain}/
    4. Confirm direct *.run.app traffic is rejected:
       curl -i ${google_cloud_run_v2_service.app.uri}/
       (should return 403 because no X-Origin-Auth header.)
  EOT
}