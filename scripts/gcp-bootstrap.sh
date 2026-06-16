#!/usr/bin/env bash
# One-time GCP bootstrap for Autodidact's production environment.
# Codifies the manual (pre-Terraform) steps of docs/gcp_infra_setup.md:
#   enable APIs → runtime service account → state bucket → Secret Manager secrets
#   → Workload Identity Federation → generate terraform.tfvars.
#
# It deliberately does NOT run `terraform apply` — that targets live prod and the
# infra/CLAUDE.md invariant is "always plan before apply". The script prints the
# exact next steps when it finishes.
#
# Prereqs: gcloud + terraform installed, and `gcloud auth login` +
# `gcloud auth application-default login` already done. Fill infra/secrets.env first.
#
# Idempotent: safe to re-run. Existing resources are detected and left in place;
# secret values are updated to a new version.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step()  { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}✓ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
die()   { echo -e "${RED}✗ $*${NC}"; exit 1; }
info()  { echo -e "  $*"; }

echo -e "\n${BOLD}Autodidact — GCP bootstrap${NC}"
echo "────────────────────────────────────────"

# ── Prereqs ──────────────────────────────────────────────────────────────────
step "Checking prerequisites"
command -v gcloud    >/dev/null || die "gcloud not found — install the Google Cloud CLI"
command -v terraform >/dev/null || die "terraform not found — install Terraform >= 1.9.0"
gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . \
  || die "no active gcloud account — run: gcloud auth login && gcloud auth application-default login"
ok "gcloud and terraform present, account authenticated"

SECRETS_ENV="$ROOT/infra/secrets.env"
[ -f "$SECRETS_ENV" ] || die "missing infra/secrets.env — copy infra/secrets.env.example and fill it in"
# shellcheck disable=SC1090
set -a; source "$SECRETS_ENV"; set +a
: "${PROJECT_ID:?set PROJECT_ID in infra/secrets.env}"
: "${REGION:?set REGION in infra/secrets.env}"
[ "$PROJECT_ID" != "your-gcp-project-id" ] || die "PROJECT_ID is still the placeholder — edit infra/secrets.env"
GITHUB_REPO="${GITHUB_REPO:-DavidRoyBlue/Autodidact}"
SA_NAME="autodidact-run"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
STATE_BUCKET="autodidact-terraform-state"

gcloud config set project "$PROJECT_ID" >/dev/null
ok "project=$PROJECT_ID region=$REGION sa=$SA_EMAIL"

# ── 1. Enable APIs ───────────────────────────────────────────────────────────
step "Enabling required APIs (idempotent)"
gcloud services enable \
  run.googleapis.com cloudtasks.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com cloudresourcemanager.googleapis.com --project "$PROJECT_ID"
ok "APIs enabled"

# ── 2. Runtime service account + secretAccessor ──────────────────────────────
step "Runtime service account"
if gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  ok "service account already exists"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Autodidact Cloud Run runtime" --project "$PROJECT_ID"
  ok "created $SA_EMAIL"
fi
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor" \
  --condition=None >/dev/null
ok "granted roles/secretmanager.secretAccessor"

# ── 3. Terraform state bucket ────────────────────────────────────────────────
step "Terraform state bucket gs://${STATE_BUCKET}"
if gcloud storage buckets describe "gs://${STATE_BUCKET}" >/dev/null 2>&1; then
  ok "bucket already exists"
else
  gcloud storage buckets create "gs://${STATE_BUCKET}" \
    --project "$PROJECT_ID" --location "$REGION" --uniform-bucket-level-access
  ok "created bucket"
fi
gcloud storage buckets update "gs://${STATE_BUCKET}" --versioning >/dev/null
ok "versioning enabled"

# ── 4. Secret Manager secrets ────────────────────────────────────────────────
# Secret NAMES are fixed by infra/environments/prod/main.tf. create_secret is
# create-or-add-new-version, so re-running updates values safely.
create_secret () {  # usage: create_secret <secret-name> <value>
  if gcloud secrets describe "$1" --project "$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$2" | gcloud secrets versions add "$1" --project "$PROJECT_ID" --data-file=- >/dev/null
  else
    printf '%s' "$2" | gcloud secrets create "$1" \
      --project "$PROJECT_ID" --replication-policy="automatic" --data-file=- >/dev/null
  fi
  info "secret $1"
}

step "Creating / updating Secret Manager secrets"
create_secret autodidact-database-url        "${DATABASE_URL:?}"
create_secret autodidact-supabase-url        "${SUPABASE_URL:?}"
create_secret autodidact-supabase-secret-key "${SUPABASE_SECRET_KEY:?}"
create_secret autodidact-openai-api-key      "${OPENAI_API_KEY:?}"
create_secret autodidact-otel-endpoint       "${OTEL_EXPORTER_OTLP_ENDPOINT:-http://localhost:4318}"
create_secret autodidact-api-port            "${API_PORT:-8080}"
create_secret autodidact-agent-port          "${AGENT_PORT:-8080}"
create_secret autodidact-llm-provider        "${LLM_PROVIDER:-openai}"
create_secret autodidact-embedding-provider  "${EMBEDDING_PROVIDER:-openai}"
create_secret autodidact-auth-provider       "${AUTH_PROVIDER:-supabase}"
create_secret autodidact-checkpointer        "${CHECKPOINTER:-postgres}"
create_secret autodidact-queue-provider      "${QUEUE_PROVIDER:-cloudtasks}"
create_secret autodidact-agent-service-url    "${AGENT_SERVICE_URL:-https://placeholder}"
create_secret autodidact-worker-task-base-url "${WORKER_TASK_BASE_URL:-https://placeholder}"
ok "14 secrets present (real values + config + 2 placeholders for Step 6)"

# ── 5. Workload Identity Federation (keyless GitHub Actions deploys) ──────────
step "Workload Identity Federation for ${GITHUB_REPO}"
if gcloud iam workload-identity-pools describe github-pool \
     --project "$PROJECT_ID" --location=global >/dev/null 2>&1; then
  ok "pool github-pool exists"
else
  gcloud iam workload-identity-pools create github-pool \
    --project "$PROJECT_ID" --location=global --display-name="GitHub Actions"
  ok "created pool github-pool"
fi
if gcloud iam workload-identity-pools providers describe github-provider \
     --project "$PROJECT_ID" --location=global --workload-identity-pool=github-pool >/dev/null 2>&1; then
  ok "provider github-provider exists"
else
  gcloud iam workload-identity-pools providers create-oidc github-provider \
    --project "$PROJECT_ID" --location=global --workload-identity-pool=github-pool \
    --display-name="GitHub OIDC" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='${GITHUB_REPO}'" \
    --issuer-uri="https://token.actions.githubusercontent.com"
  ok "created provider github-provider"
fi
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" --project "$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${GITHUB_REPO}" \
  >/dev/null
for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" --role="$ROLE" --condition=None >/dev/null
done
WIF_PROVIDER=$(gcloud iam workload-identity-pools providers describe github-provider \
  --project "$PROJECT_ID" --location=global --workload-identity-pool=github-pool --format='value(name)')
ok "WIF configured; deploy roles granted to $SA_EMAIL"

# ── 6. Generate terraform.tfvars ─────────────────────────────────────────────
step "Writing infra/environments/prod/terraform.tfvars (gitignored)"
cat > "$ROOT/infra/environments/prod/terraform.tfvars" <<EOF
project_id = "${PROJECT_ID}"
region     = "${REGION}"
EOF
ok "terraform.tfvars written"

# ── Done — next steps ────────────────────────────────────────────────────────
echo -e "\n${GREEN}${BOLD}Bootstrap complete.${NC} Next:\n"
cat <<EOF
1. Provision infra (review the plan — it targets live prod):
     cd infra/environments/prod
     terraform init
     terraform plan
     terraform apply

2. Set GitHub repo Actions variables/secrets (Settings → Secrets and variables → Actions):
     Variables:
       GCP_PROJECT_ID                 = ${PROJECT_ID}
       GCP_REGION                     = ${REGION}
       GCP_WORKLOAD_IDENTITY_PROVIDER = ${WIF_PROVIDER}
       GCP_SERVICE_ACCOUNT            = ${SA_EMAIL}
     Secrets:
       PROD_DATABASE_URL              = <same Supabase pooler URL as DATABASE_URL>
   Confirm a 'production' Environment exists (deploy.yml pins environment: production).

3. Deploy: push to master (or Actions → Deploy → Run workflow). Deploy the worker
   before the api on a cold project. See docs/gcp_infra_setup.md Steps 6–7 to fill
   the real agent/worker URLs into the two placeholder secrets and verify end-to-end.
EOF
