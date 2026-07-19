#!/usr/bin/env bash
# One command to run the Autodidact mobile app end-to-end from WSL2:
#   1. Boot the Android emulator on the Windows host (idempotent, self-healing)
#   2. Require the custom DEV CLIENT (com.autodidact.app) on the device
#   3. adb reverse 8081/3000/55321, start Metro if needed, open the app
#
# Expo SDK 52 + expo-dev-client. The app CANNOT run in Expo Go (native Google
# sign-in crashes it on boot), so a missing dev client is a hard stop with build
# instructions, not a fallback. We start *plain* Metro (`expo start`) and open
# the project ourselves via the dev-client deep link — non-interactive-safe.
# Design/spec: docs/superpowers/specs/ 2026-07-19-dev-environment-design.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

# Self-contained env so Metro/adb behave the same whether or not ~/.bashrc was sourced.
export ADB_SERVER_SOCKET="tcp:localhost:5037"
# Expo CLI resolves adb to $ANDROID_HOME/platform-tools/adb. We must give Expo the
# WSL shim SDK (Linux adb) for that — but ONLY Expo: emulator.sh needs the real
# Windows ANDROID_HOME for emulator.exe/adb.exe, so we scope the shim to the expo
# subshell below rather than exporting it globally here. emulator.sh maintains the shim.
ADB_SHIM="$HOME/.android-sdk-wsl"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${CYAN}$*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
die()  { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

METRO_LOG="$ROOT/.expo-dev.log"
METRO_TIMEOUT="${METRO_TIMEOUT:-120}"
APP_ID="com.autodidact.app"
LINUX_ADB="$HOME/android-platform-tools/adb"

# --- 1. emulator -------------------------------------------------------------
info "▶ Step 1/3 — booting the emulator"
bash "$SCRIPT_DIR/emulator.sh"

# --- 2. device + dev client check --------------------------------------------
# The app REQUIRES a custom dev client (native Google sign-in); in Expo Go it
# crashes on boot, so a missing dev client is a hard stop, not a fallback.
# Detection is by the expo-dev-launcher component, NOT package presence: the
# `preview` profile APK shares the package name but is not a dev client (and
# installing it replaces the dev client — they collide on the same AVD).
serial=$(timeout 10 "$LINUX_ADB" devices | awk '$2=="device" && $1 ~ /^emulator-/{print $1; exit}')
[[ -n "$serial" ]] || die "no booted emulator visible to adb"

if ! timeout 15 "$LINUX_ADB" -s "$serial" shell dumpsys package "$APP_ID" 2>/dev/null | grep -qi devlauncher; then
  die "no dev client on $serial — the app cannot run in Expo Go (native Google sign-in).
  Build:    cd apps/mobile && npx eas-cli build --profile development --platform android
  Install:  adb install <downloaded .apk>
  then re-run: pnpm mobile:run"
fi

# --- 3. adb reverses (EVERY path, incl. Metro-already-up) --------------------
# The device reaches Metro (8081), the local API (3000) and the local Supabase
# stack (55321) via localhost thanks to these.
for port in 8081 3000 55321; do
  timeout 10 "$LINUX_ADB" -s "$serial" reverse "tcp:$port" "tcp:$port" >/dev/null 2>&1 || true
done

# --- 4. Metro (start only if not already serving) ----------------------------
# --max-time everywhere: under WSL mirrored networking, closed loopback ports
# HANG the TCP connect (no RST) instead of refusing — unbounded curl blocks ~130s.
if ! curl -fsS --max-time 2 "http://localhost:8081/status" >/dev/null 2>&1; then
  info "▶ Starting Expo/Metro (log: .expo-dev.log)"
  : > "$METRO_LOG"
  ( cd apps/mobile && CI=1 ANDROID_HOME="$ADB_SHIM" nohup pnpm start >>"$METRO_LOG" 2>&1 & )
  info "… waiting for Metro on :8081 (≤ ${METRO_TIMEOUT}s)"
  deadline=$(( SECONDS + METRO_TIMEOUT ))
  ready=""
  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 2 "http://localhost:8081/status" >/dev/null 2>&1; then ready=1; break; fi
    if grep -qiE 'CommandError|ELIFECYCLE|Command failed|adb ENOENT|EADDRINUSE' "$METRO_LOG" 2>/dev/null; then
      die "Expo failed to start — see $METRO_LOG"$'\n'"$(tail -3 "$METRO_LOG")"
    fi
    sleep 2
  done
  [[ -n "$ready" ]] || die "Metro did not become ready within ${METRO_TIMEOUT}s — see $METRO_LOG"
else
  ok "Metro already running on :8081"
fi

# --- 5. open the project in the dev client -----------------------------------
# Idempotent: re-fires the deep link until the app is foregrounded.
fg=""
for _ in 1 2 3 4 5 6; do
  fg=$(timeout 10 "$LINUX_ADB" -s "$serial" shell dumpsys activity activities 2>/dev/null | grep -i topResumedActivity || true)
  [[ "$fg" == *"$APP_ID"* ]] && break
  timeout 10 "$LINUX_ADB" -s "$serial" shell am start -a android.intent.action.VIEW \
    -d "autodidact://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" "$APP_ID" >/dev/null 2>&1 || true
  sleep 3
done
[[ "$fg" == *"$APP_ID"* ]] || warn "app not confirmed foregrounded — check the emulator screen"

ok "Dev client is open with Metro serving${serial:+ ($serial)}"
echo -e "${CYAN}  Drive it via mobile-mcp (mobile_take_screenshot / mobile_list_elements_on_screen).${NC}"
echo -e "${YELLOW}  Note: backend is NOT started by this script — run 'pnpm dev' separately. Metro log: .expo-dev.log${NC}"
