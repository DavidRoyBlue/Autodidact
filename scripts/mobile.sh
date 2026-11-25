#!/usr/bin/env bash
# Start the Expo mobile app dev server.
# Run this in a separate terminal while ./scripts/dev.sh is running.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

BOLD='\033[1m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

die() { echo -e "${RED}✗ $*${NC}"; exit 1; }

command -v npx &>/dev/null || die "npx not found. Is Node installed?"

echo -e "${CYAN}${BOLD}▶ Starting Expo dev server${NC}"
echo -e "${YELLOW}  Serves the debug APK from scripts/run-mobile.sh (Expo Go cannot run this app)${NC}"
echo -e "${YELLOW}  Backend must be running (./scripts/dev.sh) for API calls to work${NC}\n"

# A debug APK takes its config from this server's manifest, not from the build,
# so app.config.ts is evaluated here with what run-mobile.sh bakes into a build:
# the dev variant and a backend address devices reach — the PC's LAN address
# (127.0.0.1 from .env.dev would be the device itself).
host=$(ip -4 route get 1.1.1.1 | awk '{for (i = 1; i < NF; i++) if ($i == "src") {print $(i+1); exit}}')
export APP_VARIANT=dev SUPABASE_URL="http://$host:55321" AUTODIDACT_API_BASE_URL="http://$host:3000/v1"
echo -e "${YELLOW}  Backend for devices: http://$host:3000/v1, Supabase http://$host:55321${NC}\n"

cd apps/mobile
exec pnpm start
