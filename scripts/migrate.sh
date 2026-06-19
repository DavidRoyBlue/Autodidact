#!/usr/bin/env bash
# Run pending database migrations against the database in DATABASE_URL.
# Works for local (Supabase CLI stack, 127.0.0.1:55322) and production (Supabase pooler).
# Drizzle is the sole migration authority (packages/db/CLAUDE.md).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

CYAN='\033[0;36m'; BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

step() { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
die()  { echo -e "${RED}✗ $*${NC}"; exit 1; }

[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is not set in the environment"

step "Running migrations against: ${DATABASE_URL%%@*}@***"
pnpm --filter @autodidact/db db:migrate
ok "All migrations applied"
