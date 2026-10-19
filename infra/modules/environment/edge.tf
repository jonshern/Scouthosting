# The custom domain, when var.app_domain is set: a global HTTPS load
# balancer in front of the core service with a Google-managed certificate
# for the host and *.host, so every unit gets <slug>.<host> (Compass routes
# by Host header, src/middleware.ts). Cloud Run's own domain mappings
# can't take a wildcard, which is why this exists.
#
# The run.app URL stays open: Waypoint's and Lantern's Firebase rewrites
# and the blue-green checks on the green revision use it. The balancer
# marks its requests with X-Compass-Edge so the server knows where the
# client's address sits in X-Forwarded-For (src/lib/security/client-ip.ts).
#
# Costs about $18/month for the forwarding rules (shared by up to five per
# project), plus $0.008/GB processed.

locals {
  edge = var.app_domain != "" ? 1 : 0
}

resource "google_compute_global_address" "edge" {
  count = local.edge
  name  = "core-${var.name}-edge"
}

resource "google_certificate_manager_dns_authorization" "edge" {
  count  = local.edge
  name   = "core-${var.name}-domain"
  domain = var.app_domain
}

resource "google_certificate_manager_certificate" "edge" {
  count = local.edge
  name  = "core-${var.name}-cert"
  managed {
    domains            = [var.app_domain, "*.${var.app_domain}"]
    dns_authorizations = [google_certificate_manager_dns_authorization.edge[0].id]
  }
}

resource "google_certificate_manager_certificate_map" "edge" {
  count = local.edge
  name  = "core-${var.name}-certs"
}

resource "google_certificate_manager_certificate_map_entry" "edge" {
  for_each     = local.edge == 1 ? { apex = var.app_domain, units = "*.${var.app_domain}" } : {}
  name         = "core-${var.name}-${each.key}"
  map          = google_certificate_manager_certificate_map.edge[0].name
  certificates = [google_certificate_manager_certificate.edge[0].id]
  hostname     = each.value
}

resource "google_compute_region_network_endpoint_group" "edge" {
  count                 = local.edge
  name                  = "core-${var.name}-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.api.name
  }
}

resource "google_compute_backend_service" "edge" {
  count                 = local.edge
  name                  = "core-${var.name}-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  # Proves the request came through here; see CLIENT_IP_EDGE_TOKEN.
  custom_request_headers = ["X-Compass-Edge: ${random_id.generated["CLIENT_IP_EDGE_TOKEN"].hex}"]

  backend {
    group = google_compute_region_network_endpoint_group.edge[0].id
  }

  log_config {
    enable      = true
    sample_rate = 0.1
  }
}

resource "google_compute_url_map" "edge" {
  count           = local.edge
  name            = "core-${var.name}-https"
  default_service = google_compute_backend_service.edge[0].id
}

resource "google_compute_target_https_proxy" "edge" {
  count           = local.edge
  name            = "core-${var.name}-https"
  url_map         = google_compute_url_map.edge[0].id
  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.edge[0].id}"
}

resource "google_compute_global_forwarding_rule" "edge_https" {
  count                 = local.edge
  name                  = "core-${var.name}-https"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.edge[0].id
  port_range            = "443"
  target                = google_compute_target_https_proxy.edge[0].id
}

# Plain http:// sends people to https://.
resource "google_compute_url_map" "edge_redirect" {
  count = local.edge
  name  = "core-${var.name}-http"
  default_url_redirect {
    https_redirect         = true
    strip_query            = false
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
  }
}

resource "google_compute_target_http_proxy" "edge" {
  count   = local.edge
  name    = "core-${var.name}-http"
  url_map = google_compute_url_map.edge_redirect[0].id
}

resource "google_compute_global_forwarding_rule" "edge_http" {
  count                 = local.edge
  name                  = "core-${var.name}-http"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.edge[0].id
  port_range            = "80"
  target                = google_compute_target_http_proxy.edge[0].id
}
