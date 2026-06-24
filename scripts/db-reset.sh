#!/usr/bin/env bash
# DESTRUCTIVE: resets the local Supabase stack DB to a clean baseline, then re-applies
# all Drizzle migrations. Only works against the local stack. NEVER runs against prod.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}✓ $*${NC}"; }
die()   { echo -e "${RED}✗ $*${NC}"; exit 1; }

DB_URL="${DATABASE_URL:-}"
[[ -n "$DB_URL" ]] || die "DATABASE_URL not set. Run: pnpm db:reset:dev"
if [[ "$DB_URL" != *"127.0.0.1"* ]] && [[ "$DB_URL" != *"localhost"* ]]; then
  die "db-reset only works against the local stack.\nDetected: $DB_URL\nAborting to protect production data."
fi

echo -e "${RED}${BOLD}WARNING: This will delete ALL local database data.${NC}"
echo -e "Database: ${YELLOW}$DB_URL${NC}"
read -rp "Type 'yes' to confirm: " CONFIRM
[[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 0; }

step "Resetting local Supabase database to clean baseline"
pnpm exec supabase db reset
ok "Database reset (clean baseline; inert seed.sql ran)"

step "Applying Drizzle migrations"
"$SCRIPT_DIR/migrate.sh"
ok "Migrations applied"

step "Seeding the onboarding course"
pnpm --filter @autodidact/db db:seed:onboarding
ok "Onboarding course seeded"

echo -e "\n${GREEN}${BOLD}Local database reset complete.${NC}"
