#!/usr/bin/env bash
# Start the full local backend stack: Supabase stack → build → migrate → all services.
# Run mobile separately with: ./scripts/mobile.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}✓ $*${NC}"; }
die()   { echo -e "${RED}✗ $*${NC}"; exit 1; }

step "Pre-flight checks"
[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL not set. Run: pnpm dev"
command -v docker &>/dev/null || die "docker not found. Install Docker Desktop."
command -v pnpm   &>/dev/null || die "pnpm not found. Run: npm install -g pnpm"
docker info &>/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop."
ok "All pre-flight checks passed"

step "Starting local Supabase stack (first run pulls images)"
pnpm exec supabase start
ok "Supabase stack running (API 55321, DB 55322, Studio 55323)"

step "Building services (API and Worker require compiled output)"
pnpm build
ok "Build complete"

step "Running database migrations"
pnpm migrate:dev
ok "Migrations applied"

step "Starting all backend services"
echo -e "${YELLOW}  API     → http://localhost:3000/v1${NC}"
echo -e "${YELLOW}  Agent   → http://localhost:3001     (internal)${NC}"
echo -e "${YELLOW}  Worker  → http://localhost:3002     (internal task handler)${NC}"
echo
echo -e "${YELLOW}Mobile: open a new terminal and run  ./scripts/mobile.sh${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop services (then 'pnpm stop' to stop the Supabase stack)${NC}\n"

exec "$ROOT/node_modules/.bin/turbo" run dev
