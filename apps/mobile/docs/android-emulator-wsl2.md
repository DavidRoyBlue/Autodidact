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

## How the adb wiring works (and prerequisites)

The **Windows** adb server owns port `5037`; the emulator (a Windows process)
registers to it, and WSL's **Linux** adb is a pure client reaching that same server
over `localhost:5037`. This relies on:

- WSL **mirrored networking** (`.wslconfig` → `networkingMode=mirrored`) — shares
  `localhost` between WSL and Windows.
- **Matching adb versions** on both sides (Linux `~/android-platform-tools/adb` and
  the Windows SDK's `adb.exe` — both must be the same major.minor.patch, e.g.
  `37.0.0`). Mismatched versions make the two servers kill each other.

`scripts/emulator.sh` self-heals the most common breakage (a stray Linux adb server
grabbing `5037`) by killing it and re-establishing the Windows-owned server.

| Symptom | Cause | Fix |
|---------|-------|-----|
| `adb devices` empty after boot | stray Linux adb server owns `5037` | `~/android-platform-tools/adb kill-server`, re-run `pnpm emulator` |
| device flickers `offline` | two adb servers fighting over the emulator | kill both servers (`adb.exe kill-server` + `adb kill-server`), re-run |
| every `adb` command hangs (wedged server) | a Linux adb server grabbed `:5037` and got stuck | hard reset: `taskkill.exe /F /IM adb.exe` then `pkill -9 -f fork-server`, then re-run `pnpm emulator` (the qemu VM keeps running) |
| "emulator did not register" | `emulator.exe` mis-launched / wrong AVD | check the AVD name (default `Medium_Phone`); `emulator.exe -list-avds` |
| app stuck on Expo splash | Metro still bundling / can't reach Metro | wait and retry; check `.expo-dev.log` |

## Letting mobile-mcp see the emulator (one-time setup)

`mobile-mcp` (used by Claude to screenshot/drive the app) resolves adb to
`$ANDROID_HOME/platform-tools/adb`. Our `ANDROID_HOME` is the **Windows** SDK, which
only ships `adb.exe` — so mobile-mcp must be pointed at a small WSL "shim SDK" whose
`platform-tools/adb` is the **Linux** adb. `scripts/emulator.sh` creates/maintains
that shim at `~/.android-sdk-wsl`; you just need to point the mobile-mcp server at
it **once** by adding `ANDROID_HOME` to its env, then restart Claude:

```jsonc
// in the mobile-mcp server config (its env block):
"env": {
  "ANDROID_HOME": "/home/<you>/.android-sdk-wsl",
  "ADB_SERVER_SOCKET": "tcp:localhost:5037"
}
```

After this, `mobile_list_available_devices` shows `emulator-5554` and screenshots
work (binary-safe — adb's screencap streams over the protocol socket to `:5037`,
not through WSL interop).

Claude can also do all of this when you ask it to "run the mobile app" — see the
`run-mobile` skill in [`.claude/skills/run-mobile/`](../../../.claude/skills/run-mobile/SKILL.md).
