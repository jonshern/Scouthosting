# Cloud DNS — manage the apex + wildcard A records pointing at the LB.
#
# Disabled when manage_dns = false (default). Set to true to have
# Terraform create + own the zone + records. Otherwise you set the
# records at your registrar / existing DNS provider, using the
# load_balancer_ip output.

variable "manage_dns" {
  description = "If true, Terraform creates a Cloud DNS managed zone for apex_domain and writes A records pointing at the LB."
  type        = bool
  default     = false
}

resource "google_dns_managed_zone" "apex" {
  count = var.manage_dns ? 1 : 0

  name        = "${local.name}-zone"
  dns_name    = "${var.apex_domain}."
  description = "Scouthosting ${var.env} apex zone"

  depends_on = [google_project_service.apis]
}

resource "google_dns_record_set" "apex_a" {
  count = var.manage_dns ? 1 : 0

  managed_zone = google_dns_managed_zone.apex[0].name
  name         = "${var.apex_domain}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.app.address]
}

resource "google_dns_record_set" "wildcard_a" {
  count = var.manage_dns ? 1 : 0

  managed_zone = google_dns_managed_zone.apex[0].name
  name         = "*.${var.apex_domain}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.app.address]
}

output "dns_name_servers" {
  description = "If manage_dns=true, point your registrar at these name servers."
  value       = var.manage_dns ? google_dns_managed_zone.apex[0].name_servers : []
}
