# Subtree Instructions — infra/

> These rules apply only within `infra/`. They extend the root `AGENTS.md`.

## Purpose of this subtree

Terraform infrastructure as code for the Autodidact production environment on GCP. Manages: Cloud Run services (api, agent, worker), Artifact Registry for Docker images, and Cloud Tasks queues for background work (ADR-027). State is stored in GCS.

---

## Invariants (must not be broken)

- Always run `terraform plan` before `terraform apply` — never apply without reviewing the plan output
- `environments/prod/` targets the live production environment — changes here affect production immediately on apply
- Never commit `.terraform/` directories or `terraform.tfstate` files — state is remote (GCS bucket `autodidact-terraform-state`)
- Reusable modules live in `infra/modules/` — do not duplicate infrastructure resource definitions in environment configs
- All secrets are sourced from GCP Secret Manager by name — never hardcode secret values in `.tf` files
- The `env_vars` map in each `cloud-run-service` module invocation contains Secret Manager secret names (not values) — the module resolves them via `secret_key_ref`. Non-secret values (project id, region, ports) go in `plain_env_vars`
- The worker's Cloud Tasks queue `retry_config.max_attempts` and the worker's `TASK_MAX_ATTEMPTS` env var must stay in sync — the worker uses it to detect the final attempt

---

## Library / tooling rules

- Use:
  - Terraform >= 1.9.0
  - GCP provider (`hashicorp/google` ~> 5.0)
  - Remote state backend (GCS)
- Do not use:
  - Local state files (`terraform.tfstate`) — remote only
  - Inline resource definitions in `environments/` for things that belong in modules

---

## Source of truth

- Production service configurations: `infra/environments/prod/main.tf`
- Reusable modules: `infra/modules/`
- GCP project and default region: `infra/environments/prod/variables.tf` (default region: `northamerica-northeast1`)
- Provider, Terraform settings, and remote state backend: `infra/environments/prod/providers.tf` (GCS bucket: `autodidact-terraform-state`). These must live in the environment dir Terraform runs from — files at the `infra/` root are not loaded.

---

## Key patterns to follow

- One Cloud Run service per backend service (api, agent, worker), each instantiated via `modules/cloud-run-service`
- `allow_public = true` only for the api service — agent and worker are internal only
- Environment variables for services are Secret Manager references — add new secrets to the `env_vars` map by secret name
- `min_instances = 1` on api and agent prevents cold starts in production. The worker intentionally runs `min_instances = 0` — Cloud Tasks pushes tasks over HTTP, and a ~1 s cold start on a 10–30 s job is accepted (ADR-027)

---

## Anti-patterns to avoid

- Do not hardcode secret values in `.tf` files — always reference Secret Manager secret names
- Do not add infra for non-production environments unless a new directory under `environments/` exists for it
- Do not expose agent or worker services publicly — `allow_public` must remain `false` for both

---

## Common workflows

```bash
cd infra/environments/prod
terraform init          # first time, or after provider/module changes
terraform plan          # always review before applying
terraform apply         # apply after reviewing plan output
```

Terraform provisions and updates **infrastructure**. **Application code** deploys when `master` is promoted to the `production` branch (`git push origin master:production` triggers `.github/workflows/deploy.yml`, which builds the images, runs DB migrations, and `gcloud run deploy`s) — do not run `gcloud run deploy` by hand for an ordinary release. Full setup runbook: [`docs/gcp_infra_setup.md`](../docs/gcp_infra_setup.md).

---

## Key Decisions

- [ADR-012 — Cloud hosting platform](../docs/architecture/ADRs/infra/ADR-012-cloud-hosting-platform.md) (GCP Cloud Run)
- [ADR-021 — Infrastructure as code](../docs/architecture/ADRs/infra/ADR-021-infrastructure-as-code.md) (Terraform)
- [ADR-022 — CI/CD platform](../docs/architecture/ADRs/infra/ADR-022-cicd-platform.md) (GitHub Actions)
- [ADR-027 — Background job queue — migrate to GCP Cloud Tasks](../docs/architecture/ADRs/services/worker/ADR-027-background-job-queue-cloud-tasks.md) (Cloud Tasks queues; supersedes ADR-007)
