#!/usr/bin/env bash
# Stop the local Supabase stack (Postgres, GoTrue, Studio, …).
# Backend services (started by dev.sh) are stopped with Ctrl+C in that terminal.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

CYAN='\033[0;36m'; BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

step() { echo -e "${CYAN}${BOLD}▶ $*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }

step "Stopping the local Supabase stack"
pnpm exec supabase stop
ok "Supabase stack stopped"

echo
echo -e "${YELLOW}Note: local DB data is preserved. To wipe it: pnpm exec supabase stop --no-backup${NC}"
