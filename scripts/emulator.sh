#!/usr/bin/env bash
# Boot the Android emulator (which lives on the Windows host) and make it visible
# to WSL2 Linux adb — and therefore to mobile-mcp and Expo.
#
# Idempotent: safe to re-run. If the target AVD is already booted, exits 0 fast.
#
# Design (apps/mobile/docs/android-emulator-wsl2.md): the adb wiring across the
# WSL/Windows boundary — one Windows adb server on :5037, Linux adb as its
# client, matching versions, the ~/.android-sdk-wsl shim — is machine-wide and
# lives in the registered `adb-up` operation (~/Automation/docs/android-adb-wsl2.md).
# This script only boots the AVD. Self-contained on env: it does not assume
# ~/.bashrc was inherited (MCP/daemon processes often don't source it).
set -euo pipefail

# --- self-contained env ------------------------------------------------------
: "${ANDROID_HOME:=/mnt/c/Users/Proprio/AppData/Local/Android/Sdk}"
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ADB_SERVER_SOCKET="tcp:localhost:5037"

ADB_UP="${ADB_UP:-$HOME/Automation/scripts/bin/adb-up}"
LINUX_ADB="$HOME/android-platform-tools/adb"
WIN_EMU="$ANDROID_HOME/emulator/emulator.exe"
AVD="${AVD:-Medium_Phone}"
DEVICE_TIMEOUT="${DEVICE_TIMEOUT:-45}"   # fail-fast: device must REGISTER quickly
BOOT_TIMEOUT="${BOOT_TIMEOUT:-180}"      # slower: full Android boot

BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${CYAN}$*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
die()  { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

[[ -x "$ADB_UP"  ]] || die "adb-up not found at $ADB_UP (the registered ~/Automation operation that owns the WSL2 adb wiring)"
[[ -f "$WIN_EMU" ]] || die "Windows emulator.exe not found at $WIN_EMU"

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

# --- (a) adb wiring: adb-up owns it -----------------------------------------
# Version check, stray Linux server killed, Windows server started, shim kept.
# --quiet: its "no device" hint is expected here, the emulator is not up yet.
info "Ensuring the Windows adb server owns :5037 (adb-up)…"
"$ADB_UP" --quiet 2>/dev/null || die "adb-up failed — run it by hand for the reason, or: adb-up --reset"

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
