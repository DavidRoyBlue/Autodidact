# Running this app on the Android emulator

```bash
pnpm emulator     # boot the AVD (the registered android-emulator operation)
pnpm mobile:run   # the above, then start Expo/Metro and open the app
```

Both are idempotent. `mobile:run` leaves Metro running in the background (log:
`.expo-dev.log`); the backend is **not** started — run `pnpm dev` separately
for working auth/API.

## What is not this repo's

The emulator and the adb wiring are machine-wide and live in `~/Automation`:

- `~/Automation/docs/android-emulator-wsl2.md` — booting the AVD, GPU modes,
  which ABIs it accepts, emulator troubleshooting.
- `~/Automation/docs/android-adb-wsl2.md` — the Windows adb server on `:5037`,
  the Linux client, the version match, the `~/.android-sdk-wsl` shim.

`pnpm emulator` is a thin call to the `android-emulator` operation; this repo
owns no emulator script of its own.

## Reaching this app's services

The emulator reaches WSL services (Metro, API, Supabase) via `10.0.2.2` —
qemu's host loopback → Windows localhost → WSL mirrored networking.
`run-mobile.sh` exports device-facing `SUPABASE_URL` /
`AUTODIDACT_API_BASE_URL` overrides pointing at `10.0.2.2` **for Metro only**;
backend services still read the `127.0.0.1` values from `.env.dev`.

Expo CLI resolves adb through `$ANDROID_HOME/platform-tools/adb`, so
`run-mobile.sh` scopes the WSL shim SDK to the Expo subshell — the emulator
itself needs the real Windows `ANDROID_HOME`.

## Troubleshooting this app

| Symptom | Fix |
|---------|-----|
| app stuck on the Expo splash | Metro still bundling or unreachable; wait, retry, check `.expo-dev.log` |
| app crashes immediately on open | it needs the custom dev client (native Google sign-in); Expo Go will not work |

Anything about the device itself not appearing — empty `adb devices`, a
flickering `offline`, hung adb — is in the two `~/Automation` docs above.

Claude can drive all of this: see the `run-mobile` skill in
[`.agents/skills/run-mobile/`](../../../.agents/skills/run-mobile/SKILL.md).
