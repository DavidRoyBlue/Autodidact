# Infrastructure

## Purpose

Terraform infrastructure as code for the Autodidact production environment on GCP.

This folder is responsible for:
- Provisioning GCP Cloud Run services (api, agent, worker)
- Artifact Registry (`autodidact` repository) for Docker images
- Cloud Tasks queues (`autodidact-course-generation`, `autodidact-embedding`) for background work, incl. enqueuer/OIDC IAM (ADR-027)

This folder is not responsible for:
- Application code deployment (handled by CI/CD — images are built and pushed separately)
- Database schema (managed in `packages/db/migrations/`)
- Supabase configuration (managed via Supabase dashboard — see ADR-002)

---

## Where this fits

- Parent: root `README.md`
- Infrastructure decisions: `docs/architecture/ADRs/ADR-012-gcp-cloud-run-terraform.md`

---

## Structure

```
infra/
├── backend.tf                    # Remote state (GCS bucket: autodidact-terraform-state)
├── providers.tf                  # GCP provider declaration
├── environments/
│   └── prod/
│       ├── main.tf               # All service module invocations for production
│       └── variables.tf          # project_id, region, service_account_name
└── modules/
    ├── cloud-run-service/        # Reusable Cloud Run v2 service + IAM
    ├── artifact-registry/        # Docker image registry (DOCKER format)
    └── cloud-tasks/              # Task queues + enqueuer/OIDC IAM
```

---

## Service configurations (prod)

| Service | Public | CPU | Memory | Min | Max |
|---------|--------|-----|--------|-----|-----|
| autodidact-api | yes | 1 | 512Mi | 1 | 10 |
| autodidact-agent | no | 2 | 2Gi | 1 | 5 |
| autodidact-worker | no | 1 | 512Mi | 0 | 3 |

Services source secret env vars from GCP Secret Manager by secret name; non-secret Cloud Tasks config (project id, location, invoker SA, ports) is injected as plain env vars via `plain_env_vars`.

---

## Common workflows

```bash
cd infra/environments/prod
terraform init          # initialize providers and remote state
terraform plan          # preview changes
terraform apply         # apply after reviewing plan
```

---

## Key variables

| Variable | Description | Default |
|----------|-------------|---------|
| `project_id` | GCP project ID | (required) |
| `region` | GCP region for all resources | `us-central1` |
| `service_account_name` | Cloud Run service account name prefix | `autodidact-run` |

---

## Gotchas

- Always run `terraform plan` first — `environments/prod/` is the live environment
- State is stored in GCS (`autodidact-terraform-state`) — never commit local `.tfstate` files
- All environment variables in service definitions are Secret Manager secret names, not values — the `cloud-run-service` module resolves them via `secret_key_ref` at runtime
- `min_instances = 1` on all services keeps them warm; setting to 0 will introduce cold start latency on first request

## Key Decisions

- [ADR-012 — Cloud hosting platform](../docs/architecture/ADRs/infra/ADR-012-cloud-hosting-platform.md)
- [ADR-021 — Infrastructure as code](../docs/architecture/ADRs/infra/ADR-021-infrastructure-as-code.md)
- [ADR-022 — CI/CD platform](../docs/architecture/ADRs/infra/ADR-022-cicd-platform.md)
