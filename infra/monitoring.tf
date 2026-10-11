# Production monitoring: uptime checks, alerts by email, and log retention.
# Staging is not alerted on.

locals {
  prod = module.environment["prod"]
}

resource "google_monitoring_notification_channel" "email" {
  display_name = "Scouting family alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
  depends_on = [google_project_service.apis]
}

resource "google_logging_project_bucket_config" "default" {
  project        = var.project_id
  location       = "global"
  bucket_id      = "_Default"
  retention_days = var.log_retention_days
  depends_on     = [google_project_service.apis]
}

# --- Is it up? ---------------------------------------------------------------

resource "google_monitoring_uptime_check_config" "api" {
  display_name = "Core service (prod) ready"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = "/health" # fails if the database is unreachable
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = trimprefix(local.prod.app_url, "https://")
    }
  }
}

# Only for web apps that have been published (an empty Firebase site 404s).
resource "google_monitoring_uptime_check_config" "web" {
  for_each     = toset(var.monitored_web_apps)
  display_name = "${title(each.key)} website (prod)"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = "/"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = trimprefix(local.prod.web_urls[each.key], "https://")
    }
  }
}

resource "google_monitoring_alert_policy" "down" {
  display_name = "Prod is down"
  combiner     = "OR"

  dynamic "conditions" {
    for_each = merge(
      { core = google_monitoring_uptime_check_config.api.uptime_check_id },
      { for app, check in google_monitoring_uptime_check_config.web : app => check.uptime_check_id },
    )
    content {
      display_name = "${conditions.key} uptime check failing"
      condition_threshold {
        filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${conditions.value}\""
        comparison      = "COMPARISON_GT"
        threshold_value = 1
        duration        = "600s"
        aggregations {
          alignment_period     = "300s"
          per_series_aligner   = "ALIGN_NEXT_OLDER"
          cross_series_reducer = "REDUCE_COUNT_FALSE"
          group_by_fields      = ["resource.label.host"]
        }
        trigger {
          count = 1
        }
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  documentation {
    content   = "Prod uptime check failing for 10 minutes. See docs/runbooks.md#site-is-down."
    mime_type = "text/markdown"
  }
}

# --- Is it healthy? ----------------------------------------------------------

resource "google_monitoring_alert_policy" "api_errors" {
  display_name = "Core service returning errors"
  combiner     = "OR"

  conditions {
    display_name = "More than 5 server errors in 5 minutes"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${local.prod.api_service}\" AND metric.label.response_code_class=\"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  documentation {
    content   = "Prod API is returning 5xx responses. See docs/runbooks.md#errors-or-slow."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "api_slow" {
  display_name = "Core service slow"
  combiner     = "OR"

  conditions {
    display_name = "p95 latency above 3s for 15 minutes"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_latencies\" AND resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${local.prod.api_service}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 3000
      duration        = "900s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_MAX"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  documentation {
    content   = "Prod API p95 latency is above 3 seconds. See docs/runbooks.md#errors-or-slow."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "database" {
  display_name = "Core database under pressure"
  combiner     = "OR"

  dynamic "conditions" {
    for_each = {
      "CPU above 80%"    = { metric = "cloudsql.googleapis.com/database/cpu/utilization", threshold = 0.8 }
      "Memory above 90%" = { metric = "cloudsql.googleapis.com/database/memory/utilization", threshold = 0.9 }
      "Disk above 80%"   = { metric = "cloudsql.googleapis.com/database/disk/utilization", threshold = 0.8 }
    }
    content {
      display_name = conditions.key
      condition_threshold {
        filter          = "metric.type=\"${conditions.value.metric}\" AND resource.type=\"cloudsql_database\" AND resource.label.database_id=\"${var.project_id}:${google_sql_database_instance.main.name}\""
        comparison      = "COMPARISON_GT"
        threshold_value = conditions.value.threshold
        duration        = "900s"
        aggregations {
          alignment_period   = "300s"
          per_series_aligner = "ALIGN_MEAN"
        }
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  documentation {
    content   = "Cloud SQL is running hot. See docs/runbooks.md#database-under-pressure."
    mime_type = "text/markdown"
  }
}

# --- Things that should never happen -----------------------------------------

resource "google_monitoring_alert_policy" "youth_protection" {
  display_name = "Core youth-protection refusal"
  combiner     = "OR"

  conditions {
    display_name = "Database refused a message that broke a youth-protection rule"
    condition_matched_log {
      filter = "resource.type=\"cloudsql_database\" AND textPayload:\"youth protection:\""
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
    auto_close = "86400s"
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  severity              = "CRITICAL"
  documentation {
    content   = "The database blocked a message to a scout without a guardian copied, or a scout trying to send. The API should have stopped it first, so this means a bug or misuse. See docs/runbooks.md#youth-protection-alert."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "migration_failed" {
  display_name = "Core migration failed"
  combiner     = "OR"

  conditions {
    display_name = "Migrate job logged an error"
    condition_matched_log {
      filter = "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"${local.prod.migrate_job}\" AND severity>=ERROR"
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "3600s"
    }
    auto_close = "86400s"
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  documentation {
    content   = "A production migration failed; the deploy stopped and the old version is still serving. See docs/runbooks.md#migration-failed."
    mime_type = "text/markdown"
  }
}
