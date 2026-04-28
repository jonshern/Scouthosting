# Cloud Monitoring: an uptime check on the public LB, an alert policy
# that fires when the check goes red, and an email notification channel.
#
# Disabled when alert_email is empty (default). Set it in
# terraform.tfvars to enable.

variable "alert_email" {
  description = "Email to receive uptime + spend alerts. Leave empty to disable."
  type        = string
  default     = ""
}

resource "google_monitoring_notification_channel" "email" {
  count = var.alert_email == "" ? 0 : 1

  display_name = "${local.name} alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }

  depends_on = [google_project_service.apis]
}

resource "google_monitoring_uptime_check_config" "https" {
  count = var.alert_email == "" ? 0 : 1

  display_name = "${local.name} https"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path           = "/"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.apex_domain
    }
  }
}

resource "google_monitoring_alert_policy" "down" {
  count = var.alert_email == "" ? 0 : 1

  display_name          = "${local.name} site is down"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email[0].id]

  conditions {
    display_name = "Uptime check failing"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.labels.check_id=\"${google_monitoring_uptime_check_config.https[0].uptime_check_id}\""
      duration        = "120s"
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_FRACTION_TRUE"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }
      trigger {
        count = 1
      }
    }
  }
}
