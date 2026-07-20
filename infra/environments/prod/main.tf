module "artifact_registry" {
  source     = "../../modules/artifact-registry"
  project_id = var.project_id
  region     = var.region
}

# Background task queues (ADR-027) — replaces the Memorystore Redis instance.
module "cloud_tasks" {
  source                   = "../../modules/cloud-tasks"
  project_id               = var.project_id
  region                   = var.region
  enqueuer_service_account = local.sa_email
}

locals {
  registry = module.artifact_registry.registry_url
  sa_email = "${var.service_account_name}@${var.project_id}.iam.gserviceaccount.com"

  # Secrets stored in Secret Manager — referenced by name, not value
  # Names must match the env vars the services actually read (packages/env/src/schema.ts):
  # the api validates SUPABASE_URL + SUPABASE_SECRET_KEY. SUPABASE_JWT_SECRET and
  # SUPABASE_SERVICE_ROLE_KEY are read by nobody — do not reintroduce them.
  common_secrets = {
    DATABASE_URL                = "autodidact-database-url"
    SUPABASE_URL                = "autodidact-supabase-url"
    SUPABASE_SECRET_KEY         = "autodidact-supabase-secret-key"
    OPENAI_API_KEY              = "autodidact-openai-api-key"
    OTEL_EXPORTER_OTLP_ENDPOINT = "autodidact-otel-endpoint"
  }

  # Non-secret Cloud Tasks config shared by the enqueueing services (api, worker).
  cloud_tasks_env = {
    GCP_PROJECT_ID         = var.project_id
    CLOUD_TASKS_LOCATION   = var.region
    CLOUD_TASKS_INVOKER_SA = local.sa_email
  }
}

module "api" {
  source                = "../../modules/cloud-run-service"
  service_name          = "autodidact-api"
  region                = var.region
  image                 = "${local.registry}/api:latest"
  min_instances         = 0
  max_instances         = 10
  cpu                   = "1"
  memory                = "512Mi"
  service_account_email = local.sa_email
  allow_public          = true
  env_vars              = merge(local.common_secrets, {
    AGENT_SERVICE_URL    = "autodidact-agent-service-url"
    # The api/agent port secrets (autodidact-api-port / autodidact-agent-port)
    # MUST resolve to 8080: Cloud Run routes traffic to $PORT=8080 and the
    # services bind API_PORT/AGENT_PORT, so any other value fails the readiness
    # probe. (The worker uses a plain WORKER_PORT="8080" below for the same
    # reason.)
    API_PORT             = "autodidact-api-port"
    LLM_PROVIDER         = "autodidact-llm-provider"
    AUTH_PROVIDER        = "autodidact-auth-provider"
    QUEUE_PROVIDER       = "autodidact-queue-provider"
    # Worker Cloud Run URL — set after the worker's first deploy (same
    # chicken-and-egg pattern as autodidact-agent-service-url).
    WORKER_TASK_BASE_URL = "autodidact-worker-task-base-url"
  })
  plain_env_vars        = local.cloud_tasks_env
}

module "agent" {
  source                = "../../modules/cloud-run-service"
  service_name          = "autodidact-agent"
  region                = var.region
  image                 = "${local.registry}/agent:latest"
  min_instances         = 0
  max_instances         = 5
  cpu                   = "2"
  memory                = "2Gi"
  service_account_email = local.sa_email
  allow_public          = false
  env_vars              = merge(local.common_secrets, {
    AGENT_PORT        = "autodidact-agent-port"
    LLM_PROVIDER      = "autodidact-llm-provider"
    EMBEDDING_PROVIDER = "autodidact-embedding-provider"
    CHECKPOINTER      = "autodidact-checkpointer"
  })
  # Internal callers (api, worker) run as this SA and invoke the agent with an
  # OIDC ID token; the agent stays private (allow_public = false).
  invoker_members       = ["serviceAccount:${local.sa_email}"]
}

module "worker" {
  source                = "../../modules/cloud-run-service"
  service_name          = "autodidact-worker"
  region                = var.region
  image                 = "${local.registry}/worker:latest"
  # HTTP task handler invoked per-task by Cloud Tasks — scale-to-zero is the
  # point of ADR-027 (no always-on poller). Cold start adds a few seconds to a
  # 10–30 s generation job; acceptable.
  min_instances         = 0
  max_instances         = 3
  cpu                   = "1"
  memory                = "512Mi"
  service_account_email = local.sa_email
  allow_public          = false
  env_vars              = merge(local.common_secrets, {
    AGENT_SERVICE_URL    = "autodidact-agent-service-url"
    QUEUE_PROVIDER       = "autodidact-queue-provider"
    # The worker enqueues the embedding follow-up task to itself.
    WORKER_TASK_BASE_URL = "autodidact-worker-task-base-url"
  })
  plain_env_vars        = merge(local.cloud_tasks_env, {
    # Cloud Run routes traffic to $PORT (8080); the worker listens on WORKER_PORT.
    WORKER_PORT       = "8080"
    # Mirrors max_attempts in the Cloud Tasks queue retry_config.
    TASK_MAX_ATTEMPTS = "3"
  })
  # Cloud Tasks invokes the worker with an OIDC token for this service account.
  invoker_members       = ["serviceAccount:${local.sa_email}"]
}

output "api_url"    { value = module.api.service_url }
output "agent_url"  { value = module.agent.service_url }
output "worker_url" { value = module.worker.service_url }
