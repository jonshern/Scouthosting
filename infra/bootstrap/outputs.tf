output "tfstate_bucket" {
  value = google_storage_bucket.tfstate.name
}

output "deployer_service_account" {
  value = google_service_account.deployer.email
}

output "workload_identity_provider" {
  description = "Value for the GCP_WORKLOAD_IDENTITY_PROVIDER repo variable."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "web_deployer_service_account" {
  description = "Value for GCP_DEPLOYER_SA in the Waypoint and Summit repositories."
  value       = google_service_account.web_deployer.email
}
