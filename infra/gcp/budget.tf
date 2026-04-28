# Budget alerts. Off by default — set billing_account + monthly_budget_usd
# in terraform.tfvars to enable. Keeps Cloud SQL surprise bills off the table.

variable "billing_account" {
  description = "GCP billing account ID (e.g. 012345-6789AB-CDEF01) for the budget alert. Empty disables."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Monthly budget in USD. Alert fires at 50%, 90%, 100%."
  type        = number
  default     = 100
}

resource "google_billing_budget" "monthly" {
  count = var.billing_account == "" ? 0 : 1

  billing_account = var.billing_account
  display_name    = "${local.name} monthly"

  budget_filter {
    projects = ["projects/${var.project_id}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_budget_usd)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }

  dynamic "all_updates_rule" {
    for_each = var.alert_email == "" ? [] : [1]
    content {
      monitoring_notification_channels = [google_monitoring_notification_channel.email[0].id]
      disable_default_iam_recipients   = false
    }
  }

  depends_on = [google_project_service.apis]
}
