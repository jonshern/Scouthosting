# Origin-auth shared secret.
#
# Cloudflare injects this header on every proxied request via a Transform
# Rule (see cloudflare.tf). The Express app rejects any request whose
# header doesn't match (server middleware in lib/originAuth.js). Net
# effect: hitting the *.run.app URL directly returns 403 — only requests
# that came through Cloudflare succeed.
#
# Rotation: run `terraform taint random_password.origin_auth && terraform
# apply` to issue a new secret. Cloudflare and Cloud Run pick it up
# atomically.

resource "random_password" "origin_auth" {
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "origin_auth" {
  secret_id = "${local.name}-origin-auth"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "origin_auth" {
  secret      = google_secret_manager_secret.origin_auth.id
  secret_data = random_password.origin_auth.result
}

resource "google_secret_manager_secret_iam_member" "origin_auth_access" {
  secret_id = google_secret_manager_secret.origin_auth.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}
