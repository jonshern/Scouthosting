# Cloudflare DNS + WAF + SSL.
#
# Replaces the GCP HTTPS load balancer (~$36/mo). Cloudflare proxies
# `*.<apex_domain>` to the Cloud Run service URL. Original Host header
# is preserved end-to-end; SNI to Cloud Run uses the *.run.app cert.
#
# To use: add the apex domain to Cloudflare (creates the zone), then
# put the zone ID and an API token (Edit zone DNS + Edit zone settings)
# in terraform.tfvars.

locals {
  # Bare *.run.app hostname for the CNAME target.
  cloud_run_host = trimsuffix(replace(google_cloud_run_v2_service.app.uri, "https://", ""), "/")
}

# Apex CNAME (Cloudflare auto-flattens to A records — orange-cloud only).
resource "cloudflare_record" "apex" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "CNAME"
  content = local.cloud_run_host
  proxied = true
  ttl     = 1 # 1 = auto, required when proxied
  comment = "Scouthosting apex → Cloud Run"
}

# Wildcard for tenant subdomains.
resource "cloudflare_record" "wildcard" {
  zone_id = var.cloudflare_zone_id
  name    = "*"
  type    = "CNAME"
  content = local.cloud_run_host
  proxied = true
  ttl     = 1
  comment = "Scouthosting *.<apex> → Cloud Run"
}

# Zone-wide SSL/TLS posture.
resource "cloudflare_zone_settings_override" "ssl" {
  zone_id = var.cloudflare_zone_id
  settings {
    ssl                      = "strict"  # validate Cloud Run's *.run.app cert
    always_use_https         = "on"
    automatic_https_rewrites = "on"
    min_tls_version          = "1.2"
    tls_1_3                  = "on"
    brotli                   = "on"
    security_level           = "medium"
    browser_check            = "on"
  }
}

# Inject the shared origin-auth header on every proxied request. The
# Express app rejects requests where this header doesn't match the
# secret in Secret Manager.
resource "cloudflare_ruleset" "origin_auth" {
  zone_id     = var.cloudflare_zone_id
  name        = "Scouthosting origin auth"
  description = "Inject shared secret header so direct *.run.app hits 403"
  kind        = "zone"
  phase       = "http_request_late_transform"

  rules {
    action      = "rewrite"
    description = "Set X-Origin-Auth on requests for the apex + wildcard"
    expression  = "(http.host eq \"${var.apex_domain}\" or ends_with(http.host, \".${var.apex_domain}\"))"
    enabled     = true

    action_parameters {
      headers {
        name      = "X-Origin-Auth"
        operation = "set"
        value     = random_password.origin_auth.result
      }
    }
  }
}

# Per-IP rate limit on auth + provisioning endpoints. Replaces the old
# Cloud Armor policy. 60 requests / minute / IP; ban for 5 minutes
# after 300/min sustained.
resource "cloudflare_ruleset" "rate_limit" {
  zone_id     = var.cloudflare_zone_id
  name        = "Scouthosting rate limit"
  description = "Throttle auth + provisioning"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules {
    action      = "block"
    description = "Auth / provision endpoints"
    expression  = "(http.request.uri.path matches \"^/(api/auth|admin/login|forgot|magic|reset|signup|login|api/provision)\")"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src"]
      requests_per_period = 60
      period              = 60
      mitigation_timeout  = 300
    }
  }
}

# WAF: drop common scanner paths (replaces Cloud Armor policy).
resource "cloudflare_ruleset" "scanner_block" {
  zone_id     = var.cloudflare_zone_id
  name        = "Scouthosting scanner block"
  description = "Drop obvious scanner traffic"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules {
    action      = "block"
    description = "Block obvious scanner paths"
    expression  = "(lower(http.request.uri.path) matches \"^/(wp-(admin|login|content|includes)|phpmyadmin|\\.env|\\.git/|sftp-config|aws/credentials)\")"
    enabled     = true
  }
}
