# Cloud Tasks queues for background work (ADR-027). Queue-level retry config
# replaces the application-level BullMQ retry options (3 attempts, exponential
# backoff 5 s → 25 s → 125 s). TASK_MAX_ATTEMPTS in the worker env must mirror
# max_attempts here — the worker uses it to detect the final attempt and mark
# the course 'failed'.
#
# Requires the Cloud Tasks API (cloudtasks.googleapis.com) to be enabled on the
# project.

resource "google_cloud_tasks_queue" "course_generation" {
  name     = "autodidact-course-generation"
  location = var.region

  retry_config {
    max_attempts  = 3
    min_backoff   = "5s"
    max_backoff   = "125s"
    max_doublings = 5
  }

  rate_limits {
    max_concurrent_dispatches = 3
  }
}

resource "google_cloud_tasks_queue" "embedding" {
  name     = "autodidact-embedding"
  location = var.region

  retry_config {
    max_attempts  = 3
    min_backoff   = "5s"
    max_backoff   = "125s"
    max_doublings = 5
  }

  rate_limits {
    max_concurrent_dispatches = 5
  }
}

# api and worker run as this service account and create tasks.
resource "google_project_iam_member" "enqueuer" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${var.enqueuer_service_account}"
}

# Creating a task with an OIDC token requires actAs on the token's service
# account — even when the creator and the OIDC identity are the same account.
resource "google_service_account_iam_member" "oidc_act_as" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.enqueuer_service_account}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.enqueuer_service_account}"
}

output "course_generation_queue" {
  value = google_cloud_tasks_queue.course_generation.name
}

output "embedding_queue" {
  value = google_cloud_tasks_queue.embedding.name
}
