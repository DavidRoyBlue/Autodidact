#!/usr/bin/env bash
# Stop local Docker infrastructure (Postgres).
# Backend services (started by dev.sh) are stopped with Ctrl+C in that terminal.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

CYAN='\033[0;36m'; BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

step() { echo -e "${CYAN}${BOLD}▶ $*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }

step "Stopping Docker services"
docker compose down
ok "Postgres stopped"

echo
echo -e "${YELLOW}Note: data volumes are preserved. To wipe all local data:${NC}"
echo "  docker compose down -v"
