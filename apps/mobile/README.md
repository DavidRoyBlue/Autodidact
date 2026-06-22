# @autodidact/mobile

> Pair file: [`./CLAUDE.md`](./CLAUDE.md) — agent-binding rules, invariants, source-of-truth.

React Native client for Autodidact — an AI-powered learning platform where users generate personalised courses and study through guided chat sessions with an AI tutor.

## Stack

| Concern | Library | Version |
|---------|---------|---------|
| Framework | Expo | 52 |
| Runtime | React Native | 0.76 |
| Routing | Expo Router | 4 |
| UI library | Tamagui | 2.0.0-rc.41 |
| Server state | TanStack Query | 5 |
| Client state | Zustand | 5 |
| Auth / realtime | Supabase | 2 |
| SSE streaming | @microsoft/fetch-event-source | 2 |

## Known dependency risk

`tamagui` and `@tamagui/*` are pinned to `2.0.0-rc.41` (a release candidate).
Renovate's `mobile` group is disabled for these — bump them manually, and move
off the RC to the GA `2.0.0` release once it ships.

## Running

```bash
# From monorepo root
pnpm --filter @autodidact/mobile start     # Expo dev server
pnpm --filter @autodidact/mobile ios       # iOS simulator
pnpm --filter @autodidact/mobile android   # Android emulator
pnpm --filter @autodidact/mobile typecheck # Type-check only (no test runner)
```

The app reads `supabaseUrl`, `supabasePublishableKey`, and `apiBaseUrl` from `extra`
(via `expo-constants`). In **dev**, `app.config.ts` self-loads the monorepo-root
`.env.dev` and resolves `extra.supabaseUrl` / `extra.supabasePublishableKey` from
`SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (falling back to the `app.json` defaults).
Point them at the local Supabase stack — `SUPABASE_URL=http://127.0.0.1:55321`.
The emulator reaches the stack and API over `127.0.0.1` because `run-mobile.sh` runs
`adb reverse` for `tcp:55321` (Supabase) and `tcp:3000` (API) — so the URL stays
`http://127.0.0.1:55321`, not `10.0.2.2`. Production/preview builds inject these via
EAS profile env (`eas.json`).

### Running on the Android emulator (WSL2)

The emulator lives on the **Windows host**; this repo runs in **WSL2**. Two helper
scripts bridge the gap so you don't have to fiddle with adb across the boundary:

```bash
pnpm emulator     # boot the AVD on Windows + wait until it's visible to WSL adb
pnpm mobile:run   # the above, then start Expo/Metro and open the app in Expo Go
```

Both are idempotent (safe to re-run). `mobile:run` leaves Metro running in the
background (log: `.expo-dev.log`); the backend is **not** started — run `pnpm dev`
separately for working auth/API.

**How the adb wiring works (and prerequisites).** The **Windows** adb server owns
port `5037`; the emulator (a Windows process) registers to it, and WSL's **Linux**
adb is a pure client reaching that same server over `localhost:5037`. This relies on:

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

#### Letting mobile-mcp see the emulator (one-time setup)

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
`run-mobile` skill in [`.claude/skills/run-mobile/`](../../.claude/skills/run-mobile/SKILL.md).

## Folder structure

```
apps/mobile/
├── app/                        # Expo Router file-based routes
│   ├── _layout.tsx             # Root: TamaguiProvider + QueryClient + auth guard
│   ├── (auth)/sign-in.tsx      # Unauthenticated entry
│   └── (app)/                  # Authenticated shell (tab navigator)
│       ├── index.tsx           # Dashboard / home
│       ├── profile.tsx
│       ├── courses/index.tsx
│       └── courses/[id]/
│           ├── index.tsx
│           └── modules/[moduleId]/chat.tsx
└── src/
    ├── design/                 # Token → theme → typography → config (single source of truth)
    ├── components/             # Shared UI built on the design system
    ├── stores/                 # Zustand client state (auth, chat)
    ├── api/                    # React Query hooks + typed fetch wrapper
    ├── hooks/                  # Feature-level hooks (SSE, course generation)
    └── lib/                    # Module singletons (Supabase client)
```

## Guest / anonymous accounts

The sign-in screen offers **Continue as guest** (`supabase.auth.signInAnonymously()`), which drops the user straight into the app with a real (token-backed) anonymous session. Guests see a **Save your progress** card on the profile screen that upgrades them to a real account via email + password — the user's UUID and progress are preserved. The auth-flow guard precedence is owned by `app/_layout.tsx`. See [`CLAUDE.md`](./CLAUDE.md#auth) for the binding rules.

## Deeper docs

- [Architecture](docs/architecture.md) — monorepo position, runtime dependencies, auth flow
- [Frontend architecture](docs/frontend-architecture.md) — routing, screens, provider stack
- [UI system](docs/ui-system.md) — design tokens, themes, component library
- [Data flow](docs/data-flow.md) — REST, SSE streaming, React Query
- [State management](docs/state-management.md) — Zustand stores, persistence, patterns
- [Social Sign-In setup](docs/social-sign-in.md) — Google + Facebook provider configuration, dev-build requirements

## Key Decisions

- [ADR-003 — Mobile application platform](../../docs/architecture/ADRs/apps/mobile/ADR-003-mobile-application-platform.md)
- [ADR-013 — Mobile UI system](../../docs/architecture/ADRs/apps/mobile/ADR-013-mobile-ui-system.md) (🚩)
- [ADR-014 — Mobile navigation](../../docs/architecture/ADRs/apps/mobile/ADR-014-mobile-navigation.md)
- [ADR-015 — Mobile state management](../../docs/architecture/ADRs/apps/mobile/ADR-015-mobile-state-management.md)
- [ADR-011 — Real-time streaming transport](../../docs/architecture/ADRs/services/agent/ADR-011-realtime-streaming-transport.md)
