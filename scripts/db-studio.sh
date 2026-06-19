#!/usr/bin/env bash
# Open Drizzle Studio — a browser-based GUI to inspect and edit the local database.
# Requires local Docker Postgres to be running.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

CYAN='\033[0;36m'; BOLD='\033[1m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

die() { echo -e "${RED}✗ $*${NC}"; exit 1; }

[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL not set. Run: pnpm db:studio:dev or pnpm db:studio:prod"

echo -e "${CYAN}${BOLD}▶ Opening Drizzle Studio${NC}"
echo -e "${YELLOW}  Opens at https://local.drizzle.studio${NC}"
echo -e "${YELLOW}  (Supabase Studio is also available at http://127.0.0.1:55323 when the stack is up)${NC}"
echo -e "${YELLOW}  Press Ctrl+C to stop${NC}\n"

exec pnpm --filter @autodidact/db db:studio
