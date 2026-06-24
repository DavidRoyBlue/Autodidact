resource "google_artifact_registry_repository" "autodidact" {
  location      = var.region
  repository_id = "autodidact"
  description   = "Docker images for Autodidact services"
  format        = "DOCKER"

  # Auto-prune so the repo doesn't grow unbounded with every push to master.
  # KEEP wins over DELETE when a version matches both policies, so the 3 most
  # recent builds of each image (api/agent/worker) are always retained for
  # rollback; everything older is deleted.
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent-3"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }

  cleanup_policies {
    id     = "delete-the-rest"
    action = "DELETE"
    condition {
      tag_state = "ANY"
    }
  }
}

output "registry_url" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/autodidact"
}
