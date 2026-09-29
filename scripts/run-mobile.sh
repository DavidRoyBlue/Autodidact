#!/usr/bin/env bash
# Run the mobile app on the Android emulator: build the APK here in WSL and
# install it on the device — the same recipe as Accountability's
# scripts/run-mobile.sh (Linux SDK + JDK, one ABI, gradle pinned and daemonless).
#
# The app cannot run in Expo Go: native Google sign-in crashes it at import,
# so it is always a full APK. A release build bundles the JavaScript and is
# what proves the app runs; a debug build carries no JavaScript and only runs
# with Metro serving it (`pnpm mobile`), which is for readable stack traces.
#
# The emulator is booted by the registered `android-emulator` operation and
# reached through `adb-up`, which owns the one adb server this machine has
# (Windows owns :5037, WSL's adb is its client). Never start an adb server here
# and never `adb reverse` — the device reaches WSL services via 10.0.2.2, and
# that is baked into the APK below. See ~/Automation/docs/android-{adb,emulator}-wsl2.md.
#
# Usage: scripts/run-mobile.sh [--release] [--no-install]
#   --release     bundled JavaScript: install this to check the app end to end
#   --no-install  build only, print the APK path
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

variant=debug
install=1
for arg in "$@"; do
  case "$arg" in
    --release) variant=release ;;
    --no-install) install=0 ;;
    *) echo "usage: scripts/run-mobile.sh [--release] [--no-install]" >&2; exit 2 ;;
  esac
done

APP_ID="com.autodidact.app"
# qemu's host loopback → Windows localhost → WSL mirrored networking. Exported
# for the build: app.config.ts loads .env.dev without override, so these win
# over its 127.0.0.1 values (which the device would read as itself).
export SUPABASE_URL="http://10.0.2.2:55321"
export AUTODIDACT_API_BASE_URL="http://10.0.2.2:3000/v1"

# A Linux SDK and a JDK for gradle. The shell's ANDROID_HOME is the Windows SDK
# (emulator.exe, adb.exe) and stays that for the Automation operations, which
# derive adb.exe from it — so gradle gets ours on its own line.
LINUX_SDK="${ANDROID_HOME_LINUX:-$HOME/Android/Sdk}"
for candidate in "${JAVA_HOME:-}" "$HOME/jdk/current" /usr/lib/jvm/java-17-openjdk-amd64 /usr/lib/jvm/java-21-openjdk-amd64; do
  [[ -n $candidate && -x $candidate/bin/javac ]] && { JDK="$candidate"; break; }
done
[[ -d $LINUX_SDK/platforms ]] || {
  echo "No Linux Android SDK at $LINUX_SDK." >&2
  echo "Install one: sdkmanager 'platforms;android-36' 'build-tools;36.0.0' 'ndk;27.1.12297006'" >&2
  exit 1
}
[[ -x ${JDK:-}/bin/javac ]] || {
  echo "No JDK with a compiler found (a JRE is not enough)." >&2
  echo "Unpack a Temurin JDK under ~/jdk and link it: ln -sfn ~/jdk/jdk-17* ~/jdk/current" >&2
  exit 1
}

[[ -d node_modules ]] || pnpm install --frozen-lockfile

# The APK carries one ABI and it has to be the device's own: an x86_64 emulator
# lists arm64-v8a in its abilist and installs an arm64 APK happily, then dies
# on libreactnative.so because SoLoader wants the primary ABI.
abi=x86_64
if (( install )); then
  ~/Automation/scripts/bin/android-emulator
  adb="$HOME/android-platform-tools/adb"
  export ADB_SERVER_SOCKET="tcp:localhost:5037"
  serial=$("$adb" devices | awk '$2=="device" && $1 ~ /^emulator-/{print $1; exit}')
  [[ -n $serial ]] || { echo "No booted emulator visible to adb." >&2; exit 1; }
  abi=$("$adb" -s "$serial" shell getprop ro.product.cpu.abi | tr -d '\r')
  echo "Target: $serial ($abi)"
fi

# Continuous Native Generation: android/ is generated and gitignored, never
# edited, so it is regenerated whenever the config or a native module moved on.
( cd apps/mobile && npx expo prebuild --platform android --no-install )

# One ABI and a bounded build. The new architecture compiles C++ per ABI
# through ninja, which sizes its job count from the CPU set it inherits, not
# from --max-workers, so the build is pinned to six cores; unpinned, it pushes
# the WSL VM into swap. The pin holds only for processes spawned under it —
# hence no daemon and Kotlin in-process, which needs more metaspace than the
# generated gradle.properties allows. Flags rather than gradle.properties
# edits: prebuild regenerates that file on every run.
echo "Building the ${variant} APK (${abi})…"
( cd apps/mobile/android && ANDROID_HOME="$LINUX_SDK" ANDROID_SDK_ROOT="$LINUX_SDK" JAVA_HOME="$JDK" \
    taskset -c 0-5 ./gradlew "assemble${variant^}" \
    -PreactNativeArchitectures="$abi" --no-daemon \
    -Pkotlin.compiler.execution.strategy=in-process \
    -Dorg.gradle.jvmargs="-Xmx2048m -XX:MaxMetaspaceSize=1g" --console=plain -q )

apk="apps/mobile/android/app/build/outputs/apk/${variant}/app-${variant}.apk"
[[ -f $apk ]] || { echo "build produced no APK at $apk" >&2; exit 1; }
echo "APK: $apk"

(( install )) || exit 0

# An EAS build already on the device is signed with another keystore, so a
# plain reinstall is refused (INSTALL_FAILED_UPDATE_INCOMPATIBLE): replace it.
echo "Installing on $serial…"
"$adb" -s "$serial" install -r -d "$apk" || {
  "$adb" -s "$serial" uninstall "$APP_ID"
  "$adb" -s "$serial" install "$apk"
}
"$adb" -s "$serial" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
echo "Installed and launched. Backend: the dev workspace (pnpm workspace) owns api/agent/worker; Supabase is the local stack."
[[ $variant == debug ]] && echo "Debug build: it needs Metro serving on :8081 (pnpm mobile) or it shows 'Unable to load script'."
exit 0
