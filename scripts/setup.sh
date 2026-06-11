#!/usr/bin/env bash
# First-time project setup. Run this once after cloning.
# What it does: checks prereqs → installs deps → creates .env.dev → starts Docker → migrates DB.
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

echo -e "\n${BOLD}Autodidact — first-time setup${NC}"
echo "────────────────────────────────────────"

# ── Check prerequisites ───────────────────────────────────────────────────────
step "Checking prerequisites"

NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")
[[ "$NODE_VERSION" -ge 20 ]] || die "Node.js >= 20 required (found: $(node --version 2>/dev/null || echo 'not installed')). Install from https://nodejs.org"
ok "Node.js $(node --version)"

command -v pnpm &>/dev/null || die "pnpm not found. Install: npm install -g pnpm@9"
PNPM_MAJOR=$(pnpm --version | cut -d. -f1)
[[ "$PNPM_MAJOR" -ge 9 ]] || die "pnpm >= 9 required (found: $(pnpm --version))"
ok "pnpm $(pnpm --version)"

command -v docker &>/dev/null || die "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop"
docker info &>/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop."
ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"

# ── Install dependencies ──────────────────────────────────────────────────────
step "Installing dependencies"
pnpm install
ok "Dependencies installed"

# ── Environment file ──────────────────────────────────────────────────────────
step "Environment configuration"
if [[ -f .env.dev ]]; then
  ok ".env.dev already exists (skipping)"
else
  cp .env.example .env.dev
  ok ".env.dev created from .env.example"
  echo
  warn "Review these values in .env.dev before running the app:"
  info "${BOLD}SUPABASE_URL${NC}             → Supabase project URL"
  info "${BOLD}SUPABASE_PUBLISHABLE_KEY${NC} → Supabase publishable key"
  info "${BOLD}SUPABASE_SECRET_KEY${NC}      → Supabase secret key"
  info "${BOLD}OPENAI_API_KEY${NC}           → OpenAI API key"
  info ""
  info "All available at: Supabase dashboard → Settings → API"
  info ".env.prod is not created automatically; populate it manually."
fi

# ── Docker infra ──────────────────────────────────────────────────────────────
step "Starting local infrastructure (Postgres)"
docker compose up -d
ok "Docker services started"

# ── Wait for Postgres ─────────────────────────────────────────────────────────
step "Waiting for Postgres to be ready"
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres &>/dev/null; then
    ok "Postgres is ready"
    break
  fi
  [[ $i -eq 30 ]] && die "Postgres did not become ready. Check: docker compose logs postgres"
  printf "."
  sleep 1
done

# ── Migrate ───────────────────────────────────────────────────────────────────
step "Running database migrations"
dotenv -e .env.dev -- ./scripts/migrate.sh
ok "Migrations applied"

# ── Build ─────────────────────────────────────────────────────────────────────
step "Building all packages (one-time, required for dev)"
pnpm build
ok "Build complete"

# ── Done ─────────────────────────────────────────────────────────────────────
echo
echo -e "${GREEN}${BOLD}Setup complete!${NC}"
echo "────────────────────────────────────────"
echo
if grep -q 'SUPABASE_URL=$\|SUPABASE_URL=""' .env.dev 2>/dev/null; then
  warn "Remember to fill in .env.dev with your Supabase and OpenAI credentials."
  echo
fi
echo "Next steps:"
info "1. Review .env.dev and fill in any missing Supabase + OpenAI keys"
info "2. Create .env.prod manually when you need production database access"
info "3. Fill in apps/mobile/app.json → extra.supabaseUrl and supabaseAnonKey"
info "4. In Supabase SQL Editor, run the user-sync trigger (see docs/architecture/data-model.md)"
info "5. Create a test user in Supabase dashboard → Authentication → Users"
info ""
info "Then start the app:"
info "  pnpm dev               ← backend services"
info "  ./scripts/mobile.sh    ← mobile app (separate terminal)"
