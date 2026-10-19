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
  description = "Firebase Hosting site per web app (Waypoint, Lantern)."
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

output "edge_dns" {
  description = "DNS records for the custom domain: the host and *.host point at the load balancer, and the CNAME lets Google issue the certificate. Empty without app_domain."
  value = local.edge == 0 ? [] : [
    { name = var.app_domain, type = "A", data = google_compute_global_address.edge[0].address },
    { name = "*.${var.app_domain}", type = "A", data = google_compute_global_address.edge[0].address },
    {
      name = google_certificate_manager_dns_authorization.edge[0].dns_resource_record[0].name
      type = google_certificate_manager_dns_authorization.edge[0].dns_resource_record[0].type
      data = google_certificate_manager_dns_authorization.edge[0].dns_resource_record[0].data
    },
  ]
}
