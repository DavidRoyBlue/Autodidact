---
name: run-mobile
description: Build the Autodidact mobile app (apps/mobile, Expo/React Native) in WSL and run it on the Android emulator on the Windows host. Use whenever asked to run, install, launch, screenshot or check a change in the real app, or when a task needs an Android device. Covers where the device comes from, the backend it needs, and who turns the emulator off.
---

# Run the mobile app

`apps/mobile` cannot run in Expo Go (native Google sign-in crashes it at import),
so running it means building an APK here in WSL and installing it on the
emulator. The repo script does the whole thing — the same recipe as
Accountability's `scripts/run-mobile.sh`:

```bash
scripts/run-mobile.sh --release       # build the APK, install and launch on the emulator
scripts/run-mobile.sh                 # debug APK: needs Metro (`pnpm mobile`) or it shows "Unable to load script"
scripts/run-mobile.sh --no-install    # build only, print the APK path
```

It boots the emulator, reads the device's own ABI, regenerates `android/` with
`expo prebuild`, builds pinned to six cores with no daemon (an unbounded build
has taken the WSL VM down), installs and launches. Prerequisites it checks and
explains: a Linux Android SDK at `~/Android/Sdk` and a JDK (not a JRE) at
`~/jdk/current`. A release build takes ~10 minutes from cold.

**Only a release build proves the app runs.** A debug APK carries no JavaScript
and fetches it from Metro; use it only when you need a readable stack (the
release bundle is Hermes bytecode).

## The backend it talks to

The APK bakes in `SUPABASE_URL=http://10.0.2.2:55321` and
`AUTODIDACT_API_BASE_URL=http://10.0.2.2:3000/v1` — qemu's host loopback into
WSL. So the local stack must be up: `pnpm workspace` (idempotent; owns
api:3000 / agent:3001 / worker:3002 and the Supabase stack — never start a
second one, root `AGENTS.md` "Development workspace policy"). Course generation
and module chat also need AgentPlatform on :8400.

The onboarding course is seeded by `pnpm setup`, not by migrations: after a
`pnpm db:reset:dev` run `pnpm db:seed:onboarding:dev` or every sign-in logs
"No onboarding course found" and skips auto-enroll.

## Where the device comes from

The emulator, reached through the registered Automation operations, which own
the one adb server this machine has:

```bash
~/Automation/scripts/bin/android-emulator     # boot the AVD and wait until WSL sees it (idempotent)
~/Automation/scripts/bin/adb-up                # the adb wiring on its own; `--reset` when adb hangs
```

Never start an adb server here and never `adb reverse` — tunnels accept
connections but deliver no data across the Windows-server/WSL-client split
(`~/Automation/docs/android-adb-wsl2.md`).

Google sign-in needs a Google account on the AVD once (Settings → Accounts, or
complete the native sheet's form). It survives reboots; `--bake` / wipe loses it.

## Turning the emulator off

The emulator is leased, not owned: booting it takes a lease for this session,
and `finishup` and the `SessionEnd` hook release it. A session that has
verified its change and moves on should let go early:

```bash
~/Automation/scripts/bin/android-emulator --release
```

## Verify and drive it

- `mobile_list_available_devices` → expect `emulator-5554`; `mobile_take_screenshot`
  for what is on screen, `mobile_list_elements_on_screen` to tap by ref.
- `~/android-platform-tools/adb -s emulator-5554 logcat -s ReactNativeJS` — JS logs.
- `~/android-platform-tools/adb -s emulator-5554 shell pidof com.autodidact.app` — the process.

mobile-mcp needs `ANDROID_HOME=~/.android-sdk-wsl` and
`ADB_SERVER_SOCKET=tcp:localhost:5037` in its server env (one-time; Claude
restarted once). Without it `mobile_list_available_devices` returns `[]` while
`adb devices` shows the emulator — report it rather than loop.

## Do not

- Do not run Metro against the emulator as "the app": a JS/TS change is checked
  by rebuilding `--release` (`pnpm mobile` from the workspace is for the debug
  APK's stack traces).
- Do not edit `apps/mobile/android/`: generated and gitignored; build tuning
  goes on the gradle line in `scripts/run-mobile.sh`.
- Do not use EAS for a device check: `eas.json` profiles are for Play Store
  builds (`apps/mobile/AGENTS.md` "Build & release").
