#!/usr/bin/env bash
# One command to run the Autodidact mobile app end-to-end from WSL2:
#   1. Boot the Android emulator on the Windows host (idempotent, self-healing)
#   2. Start Expo/Metro and open the app in Expo Go on that emulator
#   3. Leave Metro running in the background so mobile-mcp can drive the app
#
# Expo SDK 52 (managed, Expo Go). We start *plain* Metro (`expo start`, NOT
# `--android`) and open the app ourselves via an adb deep link in step 4. Why:
# `expo start --android` PROMPTS to upgrade an already-installed-but-outdated Expo
# Go and then aborts under non-interactive mode (no TTY). Plain Metro never touches
# the device, so it can't prompt. Requires Expo Go already installed on the emulator
# (install once with `expo start --android` interactively if it's a fresh AVD).
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

# --- 1. emulator -------------------------------------------------------------
info "▶ Step 1/3 — booting the emulator"
bash "$SCRIPT_DIR/emulator.sh"

# --- 2. Metro + open app -----------------------------------------------------
# Idempotent: if Metro is already serving on :8081, the app is already running —
# don't start a second Metro (it would collide on the port).
if curl -fsS "http://localhost:8081/status" >/dev/null 2>&1; then
  ok "Metro already running on :8081 — app is already up (skipping a second start)"
  echo -e "${CYAN}  Drive it via mobile-mcp; or stop Metro and re-run for a fresh start.${NC}"
  exit 0
fi

info "▶ Step 2/3 — starting Expo/Metro and opening the app (log: .expo-dev.log)"
: > "$METRO_LOG"
# Start plain Metro via the package's `start` script (expo start) so expo resolves
# from apps/mobile's deps — matches scripts/mobile.sh. CI=1 disables the interactive
# terminal UI (safe for background); ANDROID_HOME=$ADB_SHIM is harmless here and kept
# for consistency. nohup + background so Metro keeps serving after this script returns.
( cd apps/mobile && CI=1 ANDROID_HOME="$ADB_SHIM" nohup pnpm start >>"$METRO_LOG" 2>&1 & )

# --- 3. wait until Metro answers --------------------------------------------
info "… waiting for Metro to be ready on :8081 (≤ ${METRO_TIMEOUT}s)"
LINUX_ADB="$HOME/android-platform-tools/adb"
deadline=$(( SECONDS + METRO_TIMEOUT ))
ready=""
while (( SECONDS < deadline )); do
  if curl -fsS "http://localhost:8081/status" >/dev/null 2>&1; then ready=1; break; fi
  # abort fast on a fatal Expo failure instead of waiting out the full timeout
  if grep -qiE 'CommandError|ELIFECYCLE|Command failed|adb ENOENT|EADDRINUSE' "$METRO_LOG" 2>/dev/null; then
    die "Expo failed to start — see $METRO_LOG"$'\n'"$(tail -3 "$METRO_LOG")"
  fi
  sleep 2
done
[[ -n "$ready" ]] || die "Metro did not become ready within ${METRO_TIMEOUT}s — see $METRO_LOG"

# --- 4. open the app in Expo Go via adb -------------------------------------
# Metro is up; now open the project. adb reverse lets the device reach Metro on
# localhost:8081, then we launch the Expo Go deep link (verified for this setup).
serial=$(timeout 10 "$LINUX_ADB" devices | awk '$2=="device" && $1 ~ /^emulator-/{print $1; exit}')
if [[ -n "$serial" ]]; then
  if ! timeout 10 "$LINUX_ADB" -s "$serial" shell pm list packages 2>/dev/null | grep -q host.exp.exponent; then
    warn "Expo Go isn't installed on $serial. Install it once: (cd apps/mobile && expo start --android) interactively, then re-run."
  else
    timeout 10 "$LINUX_ADB" -s "$serial" reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true
    # Re-fire the open until the *project* (ExperienceActivity) foregrounds — not
    # Expo Go's HomeActivity, which also contains "exponent". The deep link can land
    # on Home if it fires a beat before Metro is reachable, so retry.
    for _ in 1 2 3 4 5 6; do
      fg=$(timeout 10 "$LINUX_ADB" -s "$serial" shell dumpsys activity activities 2>/dev/null | grep -i topResumedActivity)
      [[ "$fg" == *ExperienceActivity* ]] && break
      timeout 10 "$LINUX_ADB" -s "$serial" shell am start -a android.intent.action.VIEW \
        -d "exp://127.0.0.1:8081" host.exp.exponent >/dev/null 2>&1 || true
      sleep 3
    done
  fi
fi

ok "Metro is up and the app is open in Expo Go on the emulator${serial:+ ($serial)}"
echo -e "${CYAN}  Drive it now via mobile-mcp (mobile_take_screenshot / mobile_list_elements_on_screen).${NC}"
echo -e "${YELLOW}  Note: the backend is NOT started by this script — run 'pnpm dev' separately${NC}"
echo -e "${YELLOW}        for working auth/API. Metro log: .expo-dev.log${NC}"
