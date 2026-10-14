---
name: run-mobile
description: Build the Autodidact mobile app (apps/mobile, Expo/React Native) in WSL and run it on the phone plugged into the PC, or on the Android emulator on the Windows host. Use whenever asked to run, install, launch, screenshot or check a change in the real app, or when a task needs an Android device. Covers the dev loop (debug build + Metro, Fast Refresh, from a worktree), where the device comes from, the backend it needs, and who turns the emulator off.
---

# Run the mobile app

`apps/mobile` cannot run in Expo Go (native Google sign-in crashes it at import),
so running it means building an APK here in WSL and installing it on a
device: the phone plugged into the PC when there is one, else the emulator.
The repo script does the whole thing — the same recipe as Accountability's
`scripts/run-mobile.sh`:

```bash
scripts/run-mobile.sh                 # debug APK, opened on Metro: the dev loop below
scripts/run-mobile.sh --release       # bundled JavaScript: proves the app runs on its own
scripts/run-mobile.sh --no-install    # build only, print the APK path
```

Every build is the **dev variant**: "Autodidact Dev", package
`com.autodidact.app.dev`, pointed at the local stack. It installs beside the
store app (`com.autodidact.app`, from EAS `preview`/`production`, pointed at
Cloud Run), so the phone carries both and a dev install never replaces prod.

The script's header explains what it does and why (ABI, core pin, no daemon,
prebuild); it checks its own prerequisites (`~/Android/Sdk`, `~/jdk/current`) and
says how to meet them. A build takes ~10 minutes from cold.

## The dev loop

Changes reach the phone on save, like Vite: a debug APK carries no JavaScript,
it loads it from Metro, and Fast Refresh applies each save in about a second.

1. Metro serves the checkout you are editing, from the workspace's one `mobile`
   pane (`autodidact:app`, `@ws_id` mobile) — never a second Metro, never
   another port. Iterating in a worktree means pointing that pane at it — and
   the `backend` pane too when the change touches `services/` — then back at
   the main checkout when the worktree lands:

   ```bash
   # from the worktree root; mobile → 'pnpm mobile', backend → 'pnpm dev'
   pane=$(tmux list-panes -t autodidact:app -F '#{pane_id} #{@ws_id}' | awk '$2=="mobile"{print $1}')
   tmux respawn-pane -k -t "$pane" -c "$PWD" 'pnpm mobile'
   ```

   A debug APK reads its config (backend URLs) from Metro's manifest, not
   from the build: `scripts/mobile.sh` sets the PC's LAN address there, so a
   Metro started any other way serves `127.0.0.1` and every request on the
   device fails with "Network request failed".
2. `scripts/run-mobile.sh` from that same checkout. It installs the debug APK
   and opens it on `http://<host>:8081`. Rebuild only when a native dependency,
   `app.json`/`app.config.ts` or the backend address changes; everything under
   `src/` and `app/` is Fast Refresh.
3. Before calling a change done, `scripts/run-mobile.sh --release` once: the
   debug build hides a missing Babel dependency or a JS-only crash path, and is
   slower (no Hermes bytecode), so timing and animation are not representative.

A worktree builds once it has its own `node_modules` (`pnpm install`) and the
`.env.dev` symlink (root `AGENTS.md` "New branch / worktree setup"). It merges
when the work is done, not per change: keep the PR a draft while iterating.

## The backend it talks to

The APK bakes in `SUPABASE_URL=http://<host>:55321` and
`AUTODIDACT_API_BASE_URL=http://<host>:3000/v1`, where `<host>` is `10.0.2.2`
(qemu's host loopback into WSL) for the emulator and the PC's LAN address for a
phone — so a phone build is tied to the Wi-Fi it was built on, and the Windows
firewall must let those ports and Metro's 8081 in, once
(`~/Automation/docs/android-adb-wsl2.md`, "Reaching WSL services from a device"). So the local stack must be up:
`pnpm workspace` (idempotent; owns api:3000 / agent:3001 / worker:3002 and the
Supabase stack — never start a second one, root `AGENTS.md` "Development workspace policy"). Course generation
and module chat also need AgentPlatform on :8400.

The onboarding course is seeded by `pnpm setup`, not by migrations: after a
`pnpm db:reset:dev` run `pnpm db:seed:onboarding:dev` or every sign-in logs
"No onboarding course found" and skips auto-enroll.

## Where the device comes from

A phone plugged into the PC by USB with debugging on is found by `adb-up` and
wins; without one the script boots the emulator. Both go through the registered
Automation operations, which own the one adb server this machine has:

```bash
~/Automation/scripts/bin/android-emulator     # boot the AVD and wait until WSL sees it (idempotent)
~/Automation/scripts/bin/adb-up                # the adb wiring on its own; `--reset` when adb hangs
```

Never start an adb server here and never `adb reverse` — tunnels accept
connections but deliver no data across the Windows-server/WSL-client split
(`~/Automation/docs/android-adb-wsl2.md`).

Google sign-in needs a Google account on the AVD once (Settings → Accounts, or
complete the native sheet's form). It survives reboots; `--bake` / wipe loses it.
The dev package needs its own Android OAuth client in Google Cloud (and its own
entry in the Facebook app): until it has one, the native sheet fails with
`DEVELOPER_ERROR` and email or guest sign-in is the way in
(`apps/mobile/docs/social-sign-in.md` §2).

## Turning the emulator off

The emulator is leased, not owned: booting it takes a lease for this session,
and `finishup` and the `SessionEnd` hook release it. A session that has
verified its change and moves on should let go early:

```bash
~/Automation/scripts/bin/android-emulator --release
```

## Verify and drive it

`<serial>` is the one the script prints as `Target:` (`emulator-5554` for the AVD).

- `mobile_list_available_devices` → expect `<serial>`; `mobile_take_screenshot`
  for what is on screen, `mobile_list_elements_on_screen` to tap by ref.
- `~/android-platform-tools/adb -s <serial> logcat -s ReactNativeJS` — JS logs.
- `~/android-platform-tools/adb -s <serial> shell pidof com.autodidact.app.dev` — the process.

mobile-mcp needs `ANDROID_HOME=~/.android-sdk-wsl` and
`ADB_SERVER_SOCKET=tcp:localhost:5037` in its server env (one-time; Claude
restarted once). Without it `mobile_list_available_devices` returns `[]` while
`adb devices` shows the emulator — report it rather than loop.

## Do not

- Do not call a change done on the debug build alone: `--release` is the check.
- Do not edit `apps/mobile/android/`: generated and gitignored; build tuning
  goes on the gradle line in `scripts/run-mobile.sh`.
- Do not use EAS for a device check: `eas.json` profiles are for Play Store
  builds (`apps/mobile/AGENTS.md` "Build & release").
