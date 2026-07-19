#!/usr/bin/env bash
# Boot the Android emulator (which lives on the Windows host) and make it visible
# to WSL2 Linux adb — and therefore to mobile-mcp and Expo.
#
# Idempotent: safe to re-run. If the target AVD is already booted, exits 0 fast.
#
# Design (see docs in apps/mobile/README.md → "Running on the Android emulator"):
#   - The WINDOWS adb server owns :5037. The emulator (a Windows process) registers
#     to it; Linux adb is a pure client reaching that same server over mirrored
#     WSL networking (localhost:5037). adb versions must match (they do: 37.0.0).
#   - This script is SELF-CONTAINED on env — it does not assume ~/.bashrc was
#     inherited (MCP/daemon processes often don't source it).
set -euo pipefail

# --- self-contained env ------------------------------------------------------
: "${ANDROID_HOME:=/mnt/c/Users/Proprio/AppData/Local/Android/Sdk}"
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ADB_SERVER_SOCKET="tcp:localhost:5037"

LINUX_ADB="$HOME/android-platform-tools/adb"
WIN_ADB="$ANDROID_HOME/platform-tools/adb.exe"
WIN_EMU="$ANDROID_HOME/emulator/emulator.exe"
# WSL "shim SDK": mobile-mcp resolves adb to $ANDROID_HOME/platform-tools/adb, but
# ANDROID_HOME (above) is the *Windows* SDK, which only ships adb.exe. The mobile-mcp
# server is therefore configured with ANDROID_HOME=$ADB_SHIM (see apps/mobile/README
# → "Letting mobile-mcp see the emulator"); we keep that shim's adb pointing at the
# Linux adb here so the config target always exists.
ADB_SHIM="$HOME/.android-sdk-wsl"
AVD="${AVD:-Medium_Phone}"
DEVICE_TIMEOUT="${DEVICE_TIMEOUT:-45}"   # fail-fast: device must REGISTER quickly
BOOT_TIMEOUT="${BOOT_TIMEOUT:-180}"      # slower: full Android boot

BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${CYAN}$*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
die()  { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

[[ -x "$LINUX_ADB" ]] || die "Linux adb not found at $LINUX_ADB"
[[ -f "$WIN_ADB"   ]] || die "Windows adb.exe not found at $WIN_ADB"
[[ -f "$WIN_EMU"   ]] || die "Windows emulator.exe not found at $WIN_EMU"

# Ensure the mobile-mcp shim adb exists and points at the Linux adb (idempotent).
mkdir -p "$ADB_SHIM/platform-tools"
ln -sfn "$LINUX_ADB" "$ADB_SHIM/platform-tools/adb"

# Returns the serial of the target AVD if it is present AND fully booted, else "".
booted_serial() {
  local serial state name boot
  while read -r serial state; do
    [[ "$serial" == emulator-* && "$state" == "device" ]] || continue
    # `adb emu avd name` needs console auth (fails over the shared server), so read
    # the AVD name from a system property instead — reliable and auth-free.
    name=$(timeout 10 "$LINUX_ADB" -s "$serial" shell getprop ro.boot.qemu.avd_name 2>/dev/null | tr -d '\r\n')
    boot=$(timeout 10 "$LINUX_ADB" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n')
    if [[ "$name" == "$AVD" && "$boot" == "1" ]]; then echo "$serial"; return; fi
  done < <("$LINUX_ADB" devices | tail -n +2)
}

# --- (a) single-server self-heal preflight -----------------------------------
# Kill any stray *Linux* adb fork-server so it can't own :5037, then start the
# *Windows* server so it does. The Linux daemon's cmdline is
# `adb -L tcp:localhost:5037 fork-server server` (basename only — match on that,
# NOT a path), and it's a Linux process so this never touches the Windows server.
# This is the self-heal for the "empty devices / wedged server" failure.
pkill -9 -f 'adb -L tcp:localhost:5037 fork-server' 2>/dev/null || true
info "Ensuring Windows adb server owns :5037…"
timeout 30 "$WIN_ADB" start-server >/dev/null 2>&1 \
  || die "Windows adb server won't start. Reset with:  taskkill.exe /F /IM adb.exe ; pkill -9 -f fork-server  then re-run."

# --- (b) idempotent fast path ------------------------------------------------
serial="$(booted_serial)"
if [[ -n "$serial" ]]; then
  ok "Emulator already running and booted — $serial (AVD $AVD)"
  exit 0
fi

# --- (c) launch detached on Windows ------------------------------------------
if ! timeout 10 "$LINUX_ADB" devices | grep -qE '^emulator-[0-9]+[[:space:]]+device$'; then
  info "▶ Booting AVD: ${BOLD}$AVD${NC}${CYAN} (detached on Windows host)…${NC}"
  EMU_WIN="$(wslpath -w "$WIN_EMU")"
  # `start ""` => empty window title, then the quoted exe path. Launched in the
  # background with stdin/stdout detached: the emulator inherits cmd.exe's handles,
  # so a foreground call would block until the emulator EXITS (WSL interop waits on
  # the pipes). Launch failures are caught by the register timeout below.
  cmd.exe /c start "" "$EMU_WIN" -avd "$AVD" -gpu host -no-boot-anim -no-snapshot-save \
    </dev/null >/dev/null 2>&1 &
else
  info "An emulator is registered but not yet the booted target — waiting…"
fi

# --- (d) fail-fast: device must REGISTER within DEVICE_TIMEOUT ----------------
info "… waiting for the device to register (≤ ${DEVICE_TIMEOUT}s)"
serial=""
deadline=$(( SECONDS + DEVICE_TIMEOUT ))
while (( SECONDS < deadline )); do
  serial=$(timeout 10 "$LINUX_ADB" devices | awk '$2=="device" && $1 ~ /^emulator-/ {print $1; exit}')
  [[ -n "$serial" ]] && break
  sleep 2
done
[[ -n "$serial" ]] || die "emulator did not register within ${DEVICE_TIMEOUT}s — check the AVD name '$AVD' and that emulator.exe launched"

# --- (e) wait for full boot --------------------------------------------------
info "… waiting for Android to finish booting (≤ ${BOOT_TIMEOUT}s)  [$serial]"
boot=""
deadline=$(( SECONDS + BOOT_TIMEOUT ))
while (( SECONDS < deadline )); do
  boot=$(timeout 10 "$LINUX_ADB" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n')
  [[ "$boot" == "1" ]] && break
  sleep 3
done
[[ "$boot" == "1" ]] || die "emulator $serial did not finish booting within ${BOOT_TIMEOUT}s"

# --- (f) done ----------------------------------------------------------------
ok "Emulator booted — ${BOLD}$serial${NC}${GREEN} (AVD $AVD)${NC}"
echo -e "${CYAN}  mobile-mcp can now see it via: mobile_list_available_devices${NC}"
