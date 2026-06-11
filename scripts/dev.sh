#!/usr/bin/env bash
# Start the full local backend stack: Docker infra → build → migrate → all services.
# Run mobile separately with: ./scripts/mobile.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

# ── Colours ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}✓ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
die()   { echo -e "${RED}✗ $*${NC}"; exit 1; }

# ── Pre-flight checks ─────────────────────────────────────────────────────────
step "Pre-flight checks"

[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL not set. Run: pnpm dev"

command -v docker &>/dev/null || die "docker not found. Install Docker Desktop."
command -v pnpm   &>/dev/null || die "pnpm not found. Run: npm install -g pnpm"

docker info &>/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop."
ok "All pre-flight checks passed"

# ── Docker infra ──────────────────────────────────────────────────────────────
step "Starting local infrastructure (Postgres)"
docker compose up -d
ok "Docker services started"

# ── Wait for Postgres ─────────────────────────────────────────────────────────
step "Waiting for Postgres"
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres &>/dev/null; then
    ok "Postgres is ready"
    break
  fi
  [[ $i -eq 30 ]] && die "Postgres did not become ready after 30 s"
  printf "."
  sleep 1
done

# ── Build ─────────────────────────────────────────────────────────────────────
step "Building services (API and Worker require compiled output)"
pnpm build
ok "Build complete"

# ── Migrate ───────────────────────────────────────────────────────────────────
step "Running database migrations"
pnpm migrate:dev
ok "Migrations applied"

# ── Start services ────────────────────────────────────────────────────────────
step "Starting all backend services"
echo -e "${YELLOW}  API     → http://localhost:3000/v1${NC}"
echo -e "${YELLOW}  Agent   → http://localhost:3001     (internal)${NC}"
echo -e "${YELLOW}  Worker  → http://localhost:3002     (internal task handler)${NC}"
echo
echo -e "${YELLOW}Mobile: open a new terminal and run  ./scripts/mobile.sh${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}\n"

exec "$ROOT/node_modules/.bin/turbo" run dev
