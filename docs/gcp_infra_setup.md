# GCP Infrastructure Setup — Operator Runbook

A step-by-step guide for standing up Autodidact's production infrastructure on
Google Cloud, from an empty GCP project to a working deployment.

This reflects the **post-ADR-027 architecture** (background jobs on Cloud Tasks,
no Redis), which is now on `master` — the Terraform in `infra/` and the CI/CD
pipeline are ready to run.

> **Shortcut:** Steps 2, 3, and 5.1 below (enable APIs, service account, state
> bucket, all Secret Manager secrets, Workload Identity Federation, and a
> generated `terraform.tfvars`) are automated by **`scripts/gcp-bootstrap.sh`**.
> Fill in `infra/secrets.env` (copy from `infra/secrets.env.example`), run the
> script, then jump to Step 4 (`terraform apply`). The manual steps below remain
> as the explanation of what the script does.

> **Source of truth:** the actual resource definitions are in `infra/`. If this
> guide and the Terraform ever disagree, the Terraform wins — tell me and I'll
> fix the doc.

---

## 0. The mental model — what you're building

```
                                 ┌──────────────────────────┐
   Mobile app  ──HTTPS──▶        │  autodidact-api          │  (Cloud Run, PUBLIC)
                                 │  NestJS, public           │
                                 └───────┬───────────┬──────┘
                                         │           │ creates HTTP task
                            internal call│           ▼
                                         │   ┌───────────────────────┐
                                         │   │  Cloud Tasks queues    │
                                         │   │  course-generation     │
                                         │   │  embedding             │
                                         │   └─────────┬─────────────┘
                                         │             │ OIDC-authenticated POST
                                         ▼             ▼
                              ┌────────────────┐  ┌──────────────────────┐
                              │ autodidact-    │  │ autodidact-worker     │ (Cloud Run,
                              │ agent          │◀─│ Fastify task handler  │  INTERNAL,
                              │ (Cloud Run,    │  │ scale-to-zero         │  scale-to-0)
                              │  INTERNAL)     │  └──────────────────────┘
                              └────────────────┘
                                         │
                        ┌────────────────┴───────────────┐
                        ▼                                 ▼
                  Supabase Postgres                  OpenAI API
                  (external, pgvector)               (external)
```

**GCP products you will touch (and what each is for):**

| GCP product | What it does here | How you create it |
|---|---|---|
| **Cloud Run** | Runs the 3 services (`api` public, `agent` + `worker` internal) | Terraform |
| **Cloud Tasks** | 2 managed queues that push background jobs to the worker over HTTP, with retry/backoff | Terraform |
| **Artifact Registry** | Stores the Docker images CI builds (`api`, `agent`, `worker`) | Terraform |
| **Secret Manager** | Holds all runtime env vars (DB URL, keys, config) — Cloud Run reads them by name | **You, manually (gcloud)** |
| **IAM → Service Accounts** | The `autodidact-run` identity all services run as; also the GitHub deploy identity | You + Terraform |
| **Cloud Storage (GCS)** | Bucket holding Terraform's remote state | **You, manually (gcloud)** |
| **Workload Identity Federation** | Lets GitHub Actions deploy without a downloaded JSON key | **You, manually (gcloud)** |
| **External: Supabase** | Postgres + auth (not GCP — managed in the Supabase dashboard) | Supabase dashboard |
| **External: OpenAI** | LLM + embeddings | OpenAI dashboard |

**Folders in this repo you will open:**

| Folder / file | Why |
|---|---|
| `infra/environments/prod/` | **The Terraform you run** — `terraform init/plan/apply` happens here |
| `infra/environments/prod/variables.tf` | Where `project_id`, `region`, `service_account_name` are declared |
| `infra/backend.tf` | The GCS state bucket name (`autodidact-terraform-state`) |
| `infra/modules/` | Reusable building blocks — read-only, you normally don't edit these |
| `.github/workflows/deploy.yml` | The CI/CD pipeline that builds images + deploys on push to `master` |
| `packages/env/src/schema.ts` | Canonical list of env vars each service expects (cross-check) |

---

## 1. Prerequisites (on your machine)

Install and authenticate these once:

```bash
# Google Cloud CLI — https://cloud.google.com/sdk/docs/install
gcloud --version

# Terraform >= 1.9.0 — https://developer.hashicorp.com/terraform/install
terraform version

# Docker (only needed if you ever build/push images locally; CI does it for you)
docker --version

# Log in and pick your project
gcloud auth login
gcloud auth application-default login   # so Terraform can use your creds
```

You also need:
- A **GCP project** with **billing enabled** (note its **Project ID** — not the
  display name; e.g. `autodidact-494819`).
- A **Supabase project** (for the Postgres DB + auth).
- An **OpenAI API key**.

Throughout this doc, set these once so you can copy-paste:

```bash
export PROJECT_ID="your-gcp-project-id"     # e.g. autodidact-494819
export REGION="us-central1"                  # must match infra default
export SA_NAME="autodidact-run"              # the runtime service account name
export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud config set project "$PROJECT_ID"
```

---

## 2. One-time GCP bootstrap (manual — before Terraform)

Terraform assumes a few things already exist. Create them by hand once.

### 2.1 Enable the required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudtasks.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project "$PROJECT_ID"
```

(Memorystore/Redis and the VPC connector are **no longer needed** — that's the
whole point of ADR-027.)

### 2.2 Create the runtime service account

All three Cloud Run services run as this single account, and Cloud Tasks uses it
as its OIDC identity when calling the worker.

```bash
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="Autodidact Cloud Run runtime" \
  --project "$PROJECT_ID"
```

Grant it permission to **read secrets** (Terraform does NOT do this for you):

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor"
```

> The Cloud Tasks roles (`cloudtasks.enqueuer`, `serviceAccountUser`/actAs) and
> the worker's `run.invoker` grant **are** created by Terraform (the
> `cloud-tasks` module + `invoker_members`). You only do `secretAccessor` here.

### 2.3 Create the Terraform state bucket

Terraform stores its state in GCS (see `infra/backend.tf`). The bucket name is
fixed to `autodidact-terraform-state`.

```bash
gcloud storage buckets create gs://autodidact-terraform-state \
  --project "$PROJECT_ID" \
  --location "$REGION" \
  --uniform-bucket-level-access

# Versioning is strongly recommended for state safety
gcloud storage buckets update gs://autodidact-terraform-state --versioning
```

---

## 3. Create the secrets (Secret Manager) — the keys, and where each comes from

This is the **"which keys, and where do I put them"** part.

Every entry in each service's `env_vars` map (in `infra/environments/prod/main.tf`)
is a **Secret Manager secret referenced by name**. Cloud Run resolves them at
runtime. That means even non-sensitive config (ports, provider names) is stored
as a secret — that's how the module is wired.

> **Naming convention:** the env var `FOO_BAR` maps to a secret named
> `autodidact-foo-bar`. The exact pairs are in `main.tf` — this table is the
> authoritative checklist.

### 3.1 Helper to create a secret + set its value

```bash
create_secret () {  # usage: create_secret <secret-name> <value>
  printf '%s' "$2" | gcloud secrets create "$1" \
    --project "$PROJECT_ID" --replication-policy="automatic" --data-file=- \
  || printf '%s' "$2" | gcloud secrets versions add "$1" \
    --project "$PROJECT_ID" --data-file=-
}
```

### 3.2 The full secret checklist

**Real secrets — handle carefully (never commit, never expose to clients):**

| Secret name | Env var | Where the value comes from |
|---|---|---|
| `autodidact-database-url` | `DATABASE_URL` | Supabase → Project Settings → **Database** → Connection string → **Transaction pooler (port 6543)**. Used by api, agent, worker. |
| `autodidact-supabase-secret-key` | `SUPABASE_SECRET_KEY` | Supabase → Project Settings → **API** → **secret key** (admin). Server-side DB/admin access; tokens are verified via JWKS from `SUPABASE_URL`. Never ships to the mobile app. |
| `autodidact-openai-api-key` | `OPENAI_API_KEY` | OpenAI platform → **API keys**. Used by the agent. |

**Config-stored-as-secret — not sensitive, but the module still reads them from Secret Manager:**

| Secret name | Env var | Value to set |
|---|---|---|
| `autodidact-supabase-url` | `SUPABASE_URL` | Supabase → Settings → API → **Project URL** |
| `autodidact-otel-endpoint` | `OTEL_EXPORTER_OTLP_ENDPOINT` | Your OTEL collector URL, or a placeholder like `http://localhost:4318` if you're not wiring telemetry yet |
| `autodidact-api-port` | `API_PORT` | `8080` (Cloud Run sends traffic to port 8080) |
| `autodidact-agent-port` | `AGENT_PORT` | `8080` |
| `autodidact-llm-provider` | `LLM_PROVIDER` | `openai` |
| `autodidact-embedding-provider` | `EMBEDDING_PROVIDER` | `openai` |
| `autodidact-auth-provider` | `AUTH_PROVIDER` | `supabase` |
| `autodidact-checkpointer` | `CHECKPOINTER` | `postgres` |
| `autodidact-queue-provider` | `QUEUE_PROVIDER` | **`cloudtasks`** ← the switch that activates this whole migration in prod |
| `autodidact-agent-service-url` | `AGENT_SERVICE_URL` | **Placeholder now** (`https://placeholder`); set to the real agent URL in Step 6 |
| `autodidact-worker-task-base-url` | `WORKER_TASK_BASE_URL` | **Placeholder now** (`https://placeholder`); set to the real worker URL in Step 6 |

> **Why placeholders?** `agent-service-url` and `worker-task-base-url` are Cloud
> Run URLs that don't exist until the services are first deployed
> (chicken-and-egg). Create them with a dummy value now; fill in the real value
> in Step 6.

### 3.3 Create them all

```bash
# Real secrets — replace the right-hand values
create_secret autodidact-database-url        'postgresql://...pooler...:6543/postgres'
create_secret autodidact-supabase-secret-key 'your-supabase-secret-key'
create_secret autodidact-openai-api-key      'sk-...'

# Config
create_secret autodidact-supabase-url        'https://YOURREF.supabase.co'
create_secret autodidact-otel-endpoint       'http://localhost:4318'
create_secret autodidact-api-port            '8080'
create_secret autodidact-agent-port          '8080'
create_secret autodidact-llm-provider        'openai'
create_secret autodidact-embedding-provider  'openai'
create_secret autodidact-auth-provider       'supabase'
create_secret autodidact-checkpointer        'postgres'
create_secret autodidact-queue-provider      'cloudtasks'

# Placeholders — real values come in Step 6
create_secret autodidact-agent-service-url    'https://placeholder'
create_secret autodidact-worker-task-base-url 'https://placeholder'
```

---

## 4. Provision the infrastructure with Terraform

Open the prod environment folder:

```bash
cd infra/environments/prod
```

Provide your project id (Terraform reads `var.project_id`; `region` defaults to
`us-central1`). Easiest is a `terraform.tfvars` file **in this folder** — it's
not committed:

```bash
cat > terraform.tfvars <<EOF
project_id = "${PROJECT_ID}"
region     = "${REGION}"
EOF
```

Then the standard loop (the `infra/CLAUDE.md` invariant: **always `plan` before
`apply`**):

```bash
terraform init     # connects to the GCS state bucket from Step 2.3
terraform plan     # REVIEW THIS — it's the live production environment
terraform apply    # only after the plan looks right
```

What this creates:
- Artifact Registry repo `autodidact`
- Cloud Tasks queues `autodidact-course-generation` + `autodidact-embedding`
  (retry: 3 attempts, 5s→125s backoff) and the enqueuer/OIDC IAM
- 3 Cloud Run services (`api` public; `agent` + `worker` internal; worker scales
  to zero) wired to the secrets from Step 3

> **First-apply note:** the three Cloud Run services need their Docker images to
> exist in Artifact Registry. On a brand-new project the images aren't there
> yet, so the very first service creation can fail. Run the CI/CD deploy (Step 5)
> to build+push the images first, then re-run `terraform apply` — or accept that
> the first apply creates the registry + queues and the services land on the
> first successful deploy. Plan accordingly; this is normal for a cold start.

---

## 5. CI/CD — let GitHub Actions build and deploy (`.github/workflows/deploy.yml`)

The Deploy workflow triggers on **every push to `master`** (and manual
dispatch). It: lint → typecheck → test → build 3 Docker images → push to
Artifact Registry → run DB migrations → `gcloud run deploy` each service.

It authenticates to GCP via **Workload Identity Federation** (no JSON key file
to download or leak).

### 5.1 Set up Workload Identity Federation (one time)

```bash
# A pool + an OIDC provider trusting GitHub's token issuer
gcloud iam workload-identity-pools create github-pool \
  --project "$PROJECT_ID" --location="global" --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project "$PROJECT_ID" --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub OIDC" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='DavidRoyBlue/Autodidact'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Let the GitHub repo impersonate the runtime SA (or a dedicated deployer SA)
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project "$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/DavidRoyBlue/Autodidact"
```

The deploy identity also needs deploy permissions (grant to `$SA_EMAIL`, or a
separate deployer SA):

```bash
for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" --role="$ROLE"
done
```

Get the provider's full resource name (you need it for the GitHub variable):

```bash
gcloud iam workload-identity-pools providers describe github-provider \
  --project "$PROJECT_ID" --location="global" \
  --workload-identity-pool="github-pool" --format='value(name)'
# → projects/NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
```

### 5.2 Set the GitHub repo variables + secrets

In **GitHub → repo → Settings → Secrets and variables → Actions**:

**Variables** (the `Variables` tab — non-sensitive):

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | your project id |
| `GCP_REGION` | `us-central1` (optional; defaults to this) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | the full provider resource name from 5.1 |
| `GCP_SERVICE_ACCOUNT` | `autodidact-run@<project>.iam.gserviceaccount.com` |

**Secrets** (the `Secrets` tab — sensitive):

| Secret | Value |
|---|---|
| `PROD_DATABASE_URL` | same Supabase pooler URL as `autodidact-database-url` (used by the migration step) |

Also confirm a GitHub **Environment** named `production` exists (the workflow
pins `environment: production`) — add required reviewers there if you want a
manual gate before prod deploys.

### 5.3 Deploy

Push to `master` (or use **Actions → Deploy → Run workflow**). Watch it build,
push images, migrate, and deploy.

---

## 6. Fill in the chicken-and-egg URLs

After the first successful deploy, the real Cloud Run URLs exist. Grab them and
replace the placeholders from Step 3:

```bash
AGENT_URL=$(gcloud run services describe autodidact-agent  --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')
WORKER_URL=$(gcloud run services describe autodidact-worker --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')

printf '%s' "$AGENT_URL"  | gcloud secrets versions add autodidact-agent-service-url    --project "$PROJECT_ID" --data-file=-
printf '%s' "$WORKER_URL" | gcloud secrets versions add autodidact-worker-task-base-url --project "$PROJECT_ID" --data-file=-
```

Then **redeploy** so the services pick up the new secret versions (secrets are
pinned to `version = "latest"`, but a running revision won't refresh until it
rolls):

```bash
gcloud run services update autodidact-api    --region "$REGION" --project "$PROJECT_ID"
gcloud run services update autodidact-worker --region "$REGION" --project "$PROJECT_ID"
```

---

## 7. Cutover order & verification

**Order matters** (so the first enqueue doesn't 404):

1. `terraform apply` — Cloud Tasks queues + worker `run.invoker` IAM exist.
2. Deploy the **worker** before the **api** (api enqueues to the worker).
3. Ensure `autodidact-queue-provider` = `cloudtasks` and
   `autodidact-worker-task-base-url` = the real worker URL.

**Verify:**

```bash
# Services are up
gcloud run services list --region "$REGION" --project "$PROJECT_ID"

# Queues exist
gcloud tasks queues list --location "$REGION" --project "$PROJECT_ID"

# End-to-end: create a course via the api, then confirm it moves
#   pending → generating → ready, and GET /courses/status/:courseId
#   reports pending → active → completed.
```

If a course never leaves `pending`, the usual cause is the worker URL secret
still being the placeholder, or `QUEUE_PROVIDER` not being `cloudtasks`. The
factory **fails fast at boot** on a missing/unknown queue provider, so check the
api/worker Cloud Run logs for that error first.

---

## 8. Quick reference — "what do I do where"

| I want to… | Go here |
|---|---|
| Create the project, SA, state bucket, enable APIs | **gcloud CLI** (Step 2) |
| Create / update keys & config | **Secret Manager** via gcloud (Step 3) |
| Provision queues, registry, Cloud Run | **Terraform** in `infra/environments/prod/` (Step 4) |
| Build images & deploy | **GitHub Actions** `deploy.yml`, push to `master` (Step 5) |
| Get the DB URL, secret key, Supabase URL | **Supabase dashboard** → Project Settings |
| Get the LLM key | **OpenAI dashboard** → API keys |
| See queue retry/backoff config | `infra/modules/cloud-tasks/main.tf` |
| See exactly which secrets each service reads | `infra/environments/prod/main.tf` |
| See what env vars a service expects | `packages/env/src/schema.ts` |

---

## Related decisions

- **ADR-012** — GCP Cloud Run as the hosting platform
- **ADR-021** — Terraform / infrastructure as code
- **ADR-022** — GitHub Actions for CI/CD
- **ADR-027** — Background job queue on Cloud Tasks (supersedes ADR-007); the
  reason Redis/Memorystore/VPC are gone from this guide
