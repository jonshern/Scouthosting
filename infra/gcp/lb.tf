# HTTPS load balancer fronting Cloud Run with a managed wildcard cert
# for the apex domain and `*.<apex_domain>`. This is what makes the
# multi-tenant <slug>.scouthosting.com routing work in production.

resource "google_compute_region_network_endpoint_group" "run" {
  name                  = "${local.name}-run-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.app.name
  }
}

resource "google_compute_backend_service" "app" {
  name                  = "${local.name}-app-backend"
  protocol              = "HTTPS"
  port_name             = "http"
  timeout_sec           = 60
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.run.id
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

resource "google_compute_url_map" "app" {
  name            = "${local.name}-url-map"
  default_service = google_compute_backend_service.app.id
}

resource "google_compute_managed_ssl_certificate" "wildcard" {
  name = "${local.name}-wildcard-cert"

  managed {
    domains = [
      var.apex_domain,
      "*.${var.apex_domain}",
    ]
  }
}

resource "google_compute_target_https_proxy" "app" {
  name             = "${local.name}-https-proxy"
  url_map          = google_compute_url_map.app.id
  ssl_certificates = [google_compute_managed_ssl_certificate.wildcard.id]
}

# HTTP→HTTPS redirect.
resource "google_compute_url_map" "http_redirect" {
  name = "${local.name}-http-redirect"
  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "http" {
  name    = "${local.name}-http-proxy"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_address" "app" {
  name = "${local.name}-ip"
}

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "${local.name}-fwd-https"
  target                = google_compute_target_https_proxy.app.id
  port_range            = "443"
  ip_address            = google_compute_global_address.app.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "${local.name}-fwd-http"
  target                = google_compute_target_http_proxy.http.id
  port_range            = "80"
  ip_address            = google_compute_global_address.app.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
