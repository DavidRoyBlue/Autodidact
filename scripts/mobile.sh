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
echo -e "${YELLOW}  Scan the QR code with Expo Go, or press i/a for simulator${NC}"
echo -e "${YELLOW}  Backend must be running (./scripts/dev.sh) for API calls to work${NC}\n"

cd apps/mobile
exec pnpm start
