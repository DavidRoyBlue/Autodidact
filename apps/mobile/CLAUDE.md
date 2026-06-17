# Subtree Instructions — apps/mobile/

> Agent-binding rules for this subtree. Extends root `CLAUDE.md`.
> Pair file: [`./README.md`](./README.md) — narrative, workflows, gotchas.

## Purpose

Expo React Native mobile app. The only client-facing application. Communicates exclusively with `services/api`. Never calls `services/agent` or `services/worker` directly.

---

## Out of scope

This subtree does NOT own:
- Business logic (lives in `services/api`)
- Direct AI/LLM interaction (all AI goes through the API)
- Background job orchestration
- Persistence beyond local client state (`expo-secure-store` for auth token only)

---

## Invariants (must not be broken)

### Networking
- Only call `services/api` — never directly contact `services/agent` or `services/worker`
- No direct `fetch()` in components — use TanStack Query hooks or `apiFetch`
- `API_BASE_URL` read via `expo-constants` from `extra.apiBaseUrl`, which `app.config.ts` resolves from the `AUTODIDACT_API_BASE_URL` build env (set per EAS profile in `eas.json`), falling back to the `app.json` dev default (`http://localhost:3000/v1`) — never hardcode a URL in code. Production/preview builds point at Cloud Run; local `expo start` uses the dev default.

### State
- Server state → TanStack Query only (`src/api/`) — do not cache server data in Zustand
- Client-only state → Zustand only (`src/stores/`) — do not use React Query for local UI state
- No duplication between query cache and Zustand stores
- `chat.store` is in-memory only — not persisted; cleared on app restart or when `clearMessages()` is called (e.g. when leaving the chat screen)

### Auth
- Auth tokens managed exclusively by [`src/stores/auth.store.ts`](./src/stores/auth.store.ts) via `expo-secure-store`
- `supabase` client (in `src/lib/supabase.ts`) used for auth operations only — `persistSession` must remain `false`; the auth store owns session persistence
- `apiFetch` injects the auth token automatically — do not pass tokens manually in components

### UI
- Tamagui only — do not mix `StyleSheet.create`, Styled Components, or other styling libraries
- All design tokens flow through [`src/design/`](./src/design/) — never add tokens outside this folder
- Screens import only from `@/components`, `@/stores`, or `@/api` — no raw Tamagui primitives in screen files
- `src/design/config.ts` must not be imported from other files within `src/design/` — creates a circular dependency

---

## Component relationships

- `useSSE(sessionId, courseId)` ([`src/hooks/useSSE.ts`](./src/hooks/useSSE.ts))
  - Writes to: [`src/stores/chat.store.ts`](./src/stores/chat.store.ts) via `addUserMessage` (on send, optimistic), `appendStreamToken` (per token), `finalizeStreamMessage` (on complete/error)
  - Reads from: [`src/stores/auth.store.ts`](./src/stores/auth.store.ts) via hook selector (`useAuthStore(s => s.accessToken)`) — not `getState()`
  - Fires: `useToastStore.getState().addToast(...)` on `complete` event (module-complete notification)
  - Invalidates: `['progress', courseId]` query on `complete` event
  - Used by: `app/(app)/courses/[id]/modules/[moduleId]/chat.tsx`

- `apiFetch` ([`src/api/client.ts`](./src/api/client.ts))
  - Used by: all TanStack Query hooks in [`src/api/`](./src/api/)
  - Injects: auth header from [`src/stores/auth.store.ts`](./src/stores/auth.store.ts)
  - Handles: 401 token refresh automatically

- `auth.store.ts` ([`src/stores/auth.store.ts`](./src/stores/auth.store.ts))
  - Persists via: `expo-secure-store`
  - Supplies token to: `apiFetch`, `useSSE`
  - Syncs with: `supabase` client (auth state events only)
  - Read outside React via `getState()` in: `app/_layout.tsx`, `src/api/client.ts`
  - Read inside React hook via selector in: `src/hooks/useSSE.ts`

- `toast.store.ts` ([`src/stores/toast.store.ts`](./src/stores/toast.store.ts))
  - In-memory only — not persisted
  - Written via `getState().addToast()` in: `src/hooks/useSSE.ts` (module complete)
  - Read via selector in: `src/components/display/ToastProvider.tsx`

- `ToastProvider` ([`src/components/display/ToastProvider.tsx`](./src/components/display/ToastProvider.tsx))
  - Reads: `toast.store` toast queue
  - Renders: animated toast overlay (absolutely positioned, zIndex `$lg`)
  - Placed as: sibling to `<Slot>` inside `QueryClientProvider` in `app/_layout.tsx`

- `ErrorBoundary` ([`src/components/layout/ErrorBoundary.tsx`](./src/components/layout/ErrorBoundary.tsx))
  - Wraps: `<Slot>` in `app/_layout.tsx` to catch unhandled render errors
  - Shows: "Something went wrong" card with a retry button that resets error state

- TanStack Query ([`src/api/`](./src/api/))
  - Owns: all server state (courses, modules, progress, sessions)
  - Must not overlap with: Zustand stores in [`src/stores/`](./src/stores/)

---

## Entry points

- App bootstrap: [`app/_layout.tsx`](./app/_layout.tsx) — TamaguiProvider, QueryClient, ErrorBoundary, ToastProvider, auth guard
- Auth flow: [`app/(auth)/sign-in.tsx`](./app/(auth)/sign-in.tsx) — sign-in; links to sign-up
- New user registration: [`app/(auth)/sign-up.tsx`](./app/(auth)/sign-up.tsx)
- Main app shell: [`app/(app)/index.tsx`](./app/(app)/index.tsx)
- Chat feature:
  - Route: `app/(app)/courses/[id]/modules/[moduleId]/chat.tsx`
  - Streaming: [`src/hooks/useSSE.ts`](./src/hooks/useSSE.ts)
  - State: [`src/stores/chat.store.ts`](./src/stores/chat.store.ts)
- Course generation:
  - Route: `app/(app)/courses/index.tsx`
  - Polling: [`src/hooks/useCourseGeneration.ts`](./src/hooks/useCourseGeneration.ts)

---

## Data flow (summary)

Standard query flow:
1. UI calls a TanStack Query hook (`src/api/`)
2. Hook calls `apiFetch` with route and payload
3. `apiFetch` injects auth token from `auth.store.ts`
4. Response is cached in React Query; UI re-renders reactively

Chat streaming flow:
1. Chat screen calls `useSSE` with session ID and message
2. `useSSE` calls `addUserMessage` on `chat.store.ts` (optimistic — adds user bubble, sets `isStreaming`)
3. `useSSE` opens SSE connection to `POST /chat/sessions/:id/stream`
4. Each `token` event calls `appendStreamToken` on `chat.store.ts`
5. On `complete` event: `finalizeStreamMessage` assembles the response, then `queryClient.invalidateQueries(['progress', courseId])` refreshes progress state for that course

---

## Library / tooling rules

- Use:
  - Expo SDK 52 (managed workflow)
  - Expo Router 4 for all navigation (file-based routing under `app/`)
  - TanStack Query 5 (`@tanstack/react-query`) for all server state
  - Tamagui 2 for UI components and styling
  - Zustand 5 for client-only state (auth session, chat message buffer)
  - `useSSE` for chat streaming
  - `apiFetch` (from `src/api/client.ts`) as the base fetch wrapper
- Do not use:
  - Direct `fetch()` calls in components
  - `StyleSheet.create()` for layout or styling
  - React Navigation for routing — Expo Router handles all routes; React Navigation is only used for tab bar `screenOptions` styling in `app/(app)/_layout.tsx`

---

## Source of truth

- Navigation structure: `app/` directory (Expo Router file-based routes)
- API base URL and fetch wrapper: [`src/api/client.ts`](./src/api/client.ts)
- SSE streaming protocol: [`src/hooks/useSSE.ts`](./src/hooks/useSSE.ts)
- Auth session state: [`src/stores/auth.store.ts`](./src/stores/auth.store.ts)
- Chat buffer state: [`src/stores/chat.store.ts`](./src/stores/chat.store.ts)
- Design tokens, themes, typography: [`src/design/`](./src/design/) (single source of truth for all visual constants)
- Supabase client singleton: [`src/lib/supabase.ts`](./src/lib/supabase.ts)

---

## Key patterns to follow

- In React components, select from stores with selectors: `useAuthStore(s => s.token)` — avoid selecting the whole store
- Outside React (API clients, hooks): use `store.getState()` — Zustand exposes state synchronously without a hook
- TanStack Query hooks live in `src/api/` alongside their typed fetch functions — hook and fetch in the same file
- Screens orchestrate UI only — business logic belongs in `services/api`
- Navigation params come from `useLocalSearchParams<{ id: string }>()` — not from route context or global state
- Use `AppText` and `Heading` components for all text — they resolve the Tamagui typography scale; avoid raw `fontSize` props in screens

---

## How to extend

### How to add a new API feature

1. Add a typed fetch function in `src/api/`
2. Wrap it in a TanStack Query hook (`useQuery` or `useMutation`) in the same file
3. Import and use the hook in the screen or component — never call `apiFetch` directly from a component
4. Do not duplicate the returned data in a Zustand store

### How to add a new streaming feature

1. Reuse `useSSE` ([`src/hooks/useSSE.ts`](./src/hooks/useSSE.ts)) — do not open a new `fetchEventSource` connection
2. Create a Zustand store slice for the token buffer and finalized state
3. Call `appendStreamToken` on each `token` event, `finalizeStreamMessage` on `complete`
4. Do not create a second SSE client for the same session

---

## Anti-patterns to avoid

- Do not import one store from another (`chat.store` ↔ `auth.store`) — cross-store reads go through `store.getState()` at the call site
- Do not use navigation params as a substitute for server state — fetch fresh data from React Query
- Do not add raw Tamagui primitives in screen files — wrap in `src/components/` first

---

## Commands

```bash
# From monorepo root
pnpm --filter @autodidact/mobile start      # Expo dev server
pnpm --filter @autodidact/mobile ios        # iOS simulator
pnpm --filter @autodidact/mobile android    # Android emulator
pnpm --filter @autodidact/mobile typecheck  # Type-check
pnpm --filter @autodidact/mobile test       # Jest unit/component tests (jest-expo)

# WSL2 + Windows-host Android emulator (see README → "Running on the Android emulator")
pnpm emulator      # boot the AVD on Windows, make it visible to WSL adb / mobile-mcp
pnpm mobile:run    # boot emulator + start Metro + open the app in Expo Go
```

### Build & release (EAS → Google Play)

Build profiles and the per-profile API URL live in [`eas.json`](./eas.json); `app.config.ts` injects `extra.apiBaseUrl` from each profile's `AUTODIDACT_API_BASE_URL`. The agent/api backend is on Cloud Run (see `docs/gcp_infra_setup.md`); distribution is Expo/EAS → Google Play (ADR-003).

```bash
cd apps/mobile
eas login                                    # one-time; needs an Expo account
eas init                                     # one-time; writes extra.eas.projectId into app.json
eas build --profile production --platform android   # signed .aab for the Play Console
eas build --profile preview    --platform android   # internal-distribution .apk pointing at prod
eas submit --profile production --platform android   # upload to Google Play (needs a Play service-account key)
```

> Production builds use `appVersionSource: "remote"` + `autoIncrement` — EAS bumps the Android `versionCode` each build, so Play never rejects a duplicate.

> **WSL2 adb invariant:** the **Windows** adb server must own port `5037`; start it
> (`scripts/emulator.sh` does, via `adb.exe start-server`) **before any Linux adb
> call**, so Linux adb stays a pure client and never spawns a competing server. Do
> not run `~/android-platform-tools/adb start-server` directly.

---

## Testing rules

- **Jest, not Vitest** (ADR-025): the rest of the monorepo uses Vitest, but React
  Native/Expo require **jest-expo** + `@testing-library/react-native`. Jest is
  scoped to this package only. Config: `jest.config.js` (pnpm-aware
  `transformIgnorePatterns`), setup: `jest-setup.ts`.
- Unit-test pure logic directly: Zustand stores (`src/stores/`), `apiFetch`
  (`src/api/client.ts`), hooks via `renderHook`. Mock `expo-secure-store`,
  `expo-router`, `../lib/supabase`, and `fetch` at the seam.
- Component tests render through the app's Tamagui config — use
  `renderWithProviders` from `src/test-utils/render.tsx` (wraps `TamaguiProvider`).
- `jest.mock()` factory variables must be prefixed `mock` (hoisting rule).
- UI e2e is **Maestro** (`.maestro/`), manual/nightly against a device + a
  mock-provider backend — never the PR gate. See `.maestro/README.md`.

---

## Deeper docs

- [`apps/mobile/README.md`](./README.md) — stack table, folder structure, running commands
- [`apps/mobile/docs/architecture.md`](./docs/architecture.md) — monorepo position, runtime dependencies, auth flow
- [`apps/mobile/docs/frontend-architecture.md`](./docs/frontend-architecture.md) — routing, screens, provider stack
- [`apps/mobile/docs/ui-system.md`](./docs/ui-system.md) — design tokens, themes, component library
- [`apps/mobile/docs/data-flow.md`](./docs/data-flow.md) — REST, SSE streaming, React Query patterns
- [`apps/mobile/docs/state-management.md`](./docs/state-management.md) — Zustand stores, persistence patterns

---

## Key Decisions

- [ADR-003 — Mobile application platform](../../docs/architecture/ADRs/apps/mobile/ADR-003-mobile-application-platform.md) (Expo + React Native)
- [ADR-013 — Mobile UI system](../../docs/architecture/ADRs/apps/mobile/ADR-013-mobile-ui-system.md) (Tamagui — 🚩 reconsideration flag for NativeWind)
- [ADR-014 — Mobile navigation](../../docs/architecture/ADRs/apps/mobile/ADR-014-mobile-navigation.md) (Expo Router)
- [ADR-015 — Mobile state management](../../docs/architecture/ADRs/apps/mobile/ADR-015-mobile-state-management.md) (TanStack Query + Zustand)
- [ADR-011 — Real-time streaming transport](../../docs/architecture/ADRs/services/agent/ADR-011-realtime-streaming-transport.md) (SSE — consumed by `useSSE`)
- [ADR-025 — Mobile testing strategy and second test runner](../../docs/architecture/ADRs/cross-cutting/ADR-025-mobile-testing-second-runner.md) (jest-expo + RN Testing Library; Maestro for e2e — Jest scoped to `apps/mobile` only)
