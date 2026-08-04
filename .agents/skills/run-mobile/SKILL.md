---
name: run-mobile
description: Run the Autodidact mobile app on the Android emulator from WSL2. Use when asked to "run the mobile app", "start the app", "boot the emulator", "open the app on the emulator", or to screenshot/drive the mobile UI via mobile-mcp.
---

## Run the mobile app (WSL2 + Windows-host Android emulator)

This project runs in WSL2; the Android emulator lives on the Windows host. Two
scripts encapsulate the cross-boundary adb wiring (Windows adb server owns :5037,
Linux adb is a pure client over mirrored networking). See
`apps/mobile/docs/android-emulator-wsl2.md` for the why.

### Steps

1. **Pick the scope:**
   - "boot the emulator" only → run `bash scripts/emulator.sh`
   - "run the app" / "open the app" / drive it → run `bash scripts/run-mobile.sh`
     (boots the emulator, then Expo/Metro opens the app in Expo Go).
2. **Verify with mobile-mcp** (do not trust the script exit alone):
   - `mobile_list_available_devices` → expect an `emulator-<n>` (usually `emulator-5554`).
   - `mobile_take_screenshot` → confirm the emulator/app rendered. For the full app
     run, the screenshot should show the Autodidact sign-in screen once Metro finishes
     the first bundle (give it a few seconds; re-screenshot if still on the Expo splash).
3. **If it fails, self-heal once, then report:**
   - Run `~/android-platform-tools/adb kill-server` then re-run `bash scripts/emulator.sh`.
     (Clears a stray Linux adb server that grabbed :5037 — the most common failure.)
   - Re-verify with `mobile_list_available_devices`. Only if it still fails, surface
     the troubleshooting table to the human.

### Prerequisite for mobile-mcp (one-time)

mobile-mcp must be configured with `ANDROID_HOME=~/.android-sdk-wsl` (a WSL shim
whose `platform-tools/adb` is the Linux adb; `emulator.sh` maintains it) plus
`ADB_SERVER_SOCKET=tcp:localhost:5037` in its server env, then Claude restarted
once. Without this, `mobile_list_available_devices` returns `[]` even though
`~/android-platform-tools/adb devices` shows the emulator. See
`apps/mobile/docs/android-emulator-wsl2.md` → "Letting mobile-mcp see the emulator". If devices are empty but the script
succeeded, this config is the likely cause — report it rather than looping.

### Notes

- The backend is **not** started by these scripts. For working auth/API, run
  `pnpm dev` in a separate terminal. The app still loads (sign-in screen) without it.
- Metro keeps running in the background after `run-mobile.sh`; its log is `.expo-dev.log`.
- Re-running either script is safe (idempotent): if the AVD is already booted /
  Metro is already up, it reuses them.

### Applying source edits (Metro runs with reloads DISABLED)

`run-mobile.sh` starts Metro with `CI=1`, which turns OFF file watching — the log
even says *"Metro is running in CI mode, reloads are disabled."* So **editing
source does not hot-reload.** A plain Metro restart often isn't enough either,
because two caches replay the old code and you'll see fixes you already made keep
"recurring":

1. **Metro transform cache** — lives at `"${TMPDIR:-/tmp}"/metro-cache`. In a
   Claude Code session `TMPDIR` is usually `/tmp/claude-<uid>`, **not** `/tmp` —
   so `rm /tmp/metro-*` is a no-op. Always expand `$TMPDIR`.
2. **Tamagui precompile cache** — `apps/mobile/.tamagui/tamagui.config.json`,
   written by `@tamagui/babel-plugin`. Metro reads **this file**, not
   `src/design/config.ts`, at bundle time. If it's stale, the app loads old design
   tokens regardless of the source. (It's gitignored; it regenerates on build.)

Reliable recipe after editing `apps/mobile/src/design/*` (tokens/themes/config) or
any source you need Metro to actually re-pick-up:

```bash
pkill -f "expo/bin/cli start"                      # stop Metro (verify it's down)
rm -rf apps/mobile/.tamagui \
       "${TMPDIR:-/tmp}"/metro-cache "${TMPDIR:-/tmp}"/metro-file-map-* \
       apps/mobile/node_modules/.cache             # clear BOTH caches
( cd apps/mobile && CI=1 ANDROID_HOME="$HOME/.android-sdk-wsl" \
    nohup pnpm start -- -c >> "$PWD/../../.expo-dev.log" 2>&1 & )   # cold start (-c)
# wait for http://localhost:8081/status, then force a fresh bundle on the device:
~/android-platform-tools/adb -s emulator-5554 reverse tcp:8081 tcp:8081
~/android-platform-tools/adb -s emulator-5554 shell am force-stop host.exp.exponent
~/android-platform-tools/adb -s emulator-5554 shell am start -a android.intent.action.VIEW \
    -d "exp://127.0.0.1:8081" host.exp.exponent
```

A cold bundle takes ~12s (`Android Bundled … (1686 modules)` in the log). Then
screenshot to confirm — don't assume the reload landed.

### Tamagui token rules (design-system edits)

`createTamagui()` validates at runtime (invisible to `tsc`): `size`, `space`,
`radius`, `zIndex` each need a `true` key, and **`radius`/`zIndex` keys must be a
subset of the `size` keys**. This project's `size` scale is `{ true, sm, md, lg,
xl }`. A red `createTamagui() invalid tokens.*` / `Can't find Tamagui
configuration` screen means a token group violates this — fix
`apps/mobile/src/design/tokens.ts`, then apply it with the cache recipe above.

### Troubleshooting (only after the self-heal step above)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `adb devices` / mobile-mcp empty after boot | a stray Linux adb server grabbed :5037 | `~/android-platform-tools/adb kill-server`, re-run `scripts/emulator.sh` |
| device flickers `offline` | two adb servers fighting over the emulator | `<sdk>/platform-tools/adb.exe kill-server`; `~/android-platform-tools/adb kill-server`; re-run |
| every `adb` call hangs (wedged server) | a stray Linux adb server grabbed `:5037` and stuck | `taskkill.exe /F /IM adb.exe`; `pkill -9 -f fork-server`; re-run `scripts/emulator.sh` (qemu VM survives) |
| "emulator did not register within Ns" | `emulator.exe` mis-launched or wrong AVD | check `AVD` (default `Medium_Phone`); `<sdk>/emulator/emulator.exe -list-avds` |
| app stuck on Expo splash | Metro still bundling, or can't reach Metro | wait/re-screenshot; check `.expo-dev.log`; ensure `adb reverse tcp:8081` (Expo sets it) |
| a source edit isn't taking effect; an already-fixed error keeps recurring | `CI=1` Metro doesn't watch, and the Metro/Tamagui caches replay old code | use the cache recipe in "Applying source edits"; clearing `apps/mobile/.tamagui` + `"${TMPDIR:-/tmp}"/metro-cache` is the part that matters |
| red `createTamagui() invalid tokens.*` / `Can't find Tamagui configuration` | a token group violates Tamagui v2 rules (missing `true`, or `radius`/`zIndex` keys not a subset of `size`) | fix `apps/mobile/src/design/tokens.ts`, then apply via the cache recipe |
