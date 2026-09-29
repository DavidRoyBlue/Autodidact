# Running this app on the Android emulator

```bash
pnpm emulator                  # boot the AVD (the registered android-emulator operation)
pnpm mobile:run -- --release   # build the APK in WSL, install and launch it on the emulator
```

Both are idempotent. The backend is **not** started: `pnpm workspace` owns
api/agent/worker and the Supabase stack, and AgentPlatform (:8400) runs
course generation and module chat.

## What is not this repo's

The emulator and the adb wiring are machine-wide and live in `~/Automation`:

- `~/Automation/docs/android-emulator-wsl2.md` — booting the AVD, leases
  (`--release`, `--down`), `--bake`, emulator troubleshooting.
- `~/Automation/docs/android-adb-wsl2.md` — the Windows adb server on `:5037`,
  the Linux client, the version match, the `~/.android-sdk-wsl` shim.

`pnpm emulator` is a thin call to the `android-emulator` operation; this repo
owns no emulator script of its own.

## Reaching this app's services

The emulator reaches WSL services via `10.0.2.2` — qemu's host loopback →
Windows localhost → WSL mirrored networking. `run-mobile.sh` exports
`SUPABASE_URL` / `AUTODIDACT_API_BASE_URL` at `10.0.2.2` for the build, which
`app.config.ts` bakes into the APK; backend services still read the `127.0.0.1`
values from `.env.dev`.

## Troubleshooting this app

| Symptom | Fix |
|---------|-----|
| red "Unable to load script" | that is a debug APK: run Metro (`pnpm mobile`) or install `--release` |
| `INSTALL_FAILED_VERSION_DOWNGRADE` | an EAS build is on the device; `run-mobile.sh` installs with `-d` — re-run it |
| release bundle fails with `Cannot find module 'babel-preset-expo'` | the devDependency was removed; put it back (`apps/mobile/AGENTS.md`) |
| sign-in works but courses never load | api not up, or the APK was built with `127.0.0.1` URLs — rebuild through `run-mobile.sh` |

Anything about the device itself not appearing — empty `adb devices`, a
flickering `offline`, hung adb — is in the two `~/Automation` docs above.

Claude can drive all of this: see the `run-mobile` skill in
[`.agents/skills/run-mobile/`](../../../.agents/skills/run-mobile/SKILL.md).
