# Cloud Armor — basic edge protection on the LB.
#
# Default policy: per-IP rate limit (300 req/min), block obvious bad
# bots, allow everything else. Tighten as needed; this is a sane
# baseline that won't accidentally block legit Scout-parent traffic.

resource "google_compute_security_policy" "edge" {
  name        = "${local.name}-edge"
  description = "Edge protection for Scouthosting"

  # Default: allow.
  rule {
    action   = "allow"
    priority = "2147483647"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default allow"
  }

  # Per-IP rate limit on auth + provisioning endpoints. 300 requests
  # per minute is generous for a normal user, tight enough to slow
  # automated abuse.
  rule {
    action   = "rate_based_ban"
    priority = 1000
    match {
      expr {
        expression = "request.path.matches('^/(api/auth|admin/login|forgot|magic|reset|signup|login|api/provision)')"
      }
    }
    description = "Rate-limit auth + provision"

    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 60
        interval_sec = 60
      }
      ban_duration_sec = 300
      ban_threshold {
        count        = 300
        interval_sec = 60
      }
    }
  }

  # Drop common scanners on URIs we never serve.
  rule {
    action   = "deny(404)"
    priority = 2000
    match {
      expr {
        expression = "request.path.matches('(?i)/(wp-(admin|login|content|includes)|phpmyadmin|\\\\.env|\\\\.git/|sftp-config|aws/credentials)')"
      }
    }
    description = "Block obvious scanner paths"
  }

  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable = true
    }
  }
}
