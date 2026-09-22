# Running on the Android emulator (WSL2)

The emulator lives on the **Windows host**; this repo runs in **WSL2**. Two helper
scripts bridge the gap so you don't have to fiddle with adb across the boundary:

```bash
pnpm emulator     # boot the AVD on Windows + wait until it's visible to WSL adb
pnpm mobile:run   # the above, then start Expo/Metro and open the app
```

Both are idempotent (safe to re-run). `mobile:run` leaves Metro running in the
background (log: `.expo-dev.log`); the backend is **not** started — run `pnpm dev`
separately for working auth/API.

The emulator reaches WSL services (Metro, API, Supabase) via `10.0.2.2` — qemu's
host-loopback → Windows localhost → WSL mirrored networking. `run-mobile.sh` exports
device-facing `SUPABASE_URL` / `AUTODIDACT_API_BASE_URL` overrides pointing at
`10.0.2.2` for Metro only; backend services still read the `127.0.0.1` values from
`.env.dev`. Do **not** use `adb reverse`: across the Windows-adb-server/WSL-client
split the tunnels accept connections but deliver no data.

## The adb wiring is machine-wide

The Windows adb server owns `:5037`, WSL's Linux adb is its client, both builds
must match, and `~/.android-sdk-wsl` is the shim SDK for tools that resolve
`$ANDROID_HOME/platform-tools/adb` (Expo CLI, mobile-mcp). None of that is this
repo's: it is the registered `adb-up` operation in `~/Automation`, documented in
`~/Automation/docs/android-adb-wsl2.md` (model, phone over USB, troubleshooting).
`scripts/emulator.sh` calls `adb-up` first and only boots the AVD.

| Symptom | Fix |
|---------|-----|
| `adb devices` empty, device flickers `offline`, or every `adb` call hangs | `adb-up --reset`, then re-run `pnpm emulator` (the qemu VM survives) |
| "emulator did not register" | check the AVD name (default `Medium_Phone`); `emulator.exe -list-avds` |
| app stuck on Expo splash | Metro still bundling / can't reach Metro; wait and retry, check `.expo-dev.log` |
| mobile-mcp lists no device while `adb devices` does | its server env needs `ANDROID_HOME=~/.android-sdk-wsl` and `ADB_SERVER_SOCKET=tcp:localhost:5037` in `~/.claude.json`, then restart Claude |

Claude can also do all of this when you ask it to "run the mobile app" — see the
`run-mobile` skill in [`.claude/skills/run-mobile/`](../../../.claude/skills/run-mobile/SKILL.md).
