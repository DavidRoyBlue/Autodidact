# Service State: Mobile

> Expo React Native app. The only client UI. Talks only to `services/api`.
> Pair docs: [`README.md`](./README.md) · [`CLAUDE.md`](./CLAUDE.md)

## Purpose

The user-facing app: sign-in/up, home dashboard, course list, course detail with modules, and AI module-chat via SSE. Server state through TanStack Query; client state (auth session, chat buffer) through Zustand; UI built on a Tamagui design system.

## Status

- Dev Ready: ✅
- Beta Ready: ⚠️
- Production Ready: ❌

## Current State

- All MVP screens implemented: auth (sign-in/sign-up), home, courses index, course detail, module chat, profile.
- `useSSE` streaming hook, `useCourseGeneration` polling hook, `apiFetch` wrapper with auto 401 refresh.
- Design system in place (tokens → themes → typography → config); shared component library.
- App-level resilience UI: `ErrorBoundary` (catches render errors) and a `ToastProvider` + `toast.store` (module-complete notifications).
- Auth tokens persisted via `expo-secure-store`; `supabase` client used for auth only.
- 7 test files (stores, hooks, `apiFetch`, `ChatBubble` component, markdown) plus 3 Maestro e2e flows (`.maestro/`, manual/nightly — not the PR gate). Green in CI.

## Infrastructure

- API client: ✅ `apiFetch` + TanStack Query hooks, SSE via `@microsoft/fetch-event-source`
- Auth: ✅ Supabase client + secure-store session
- Push notifications: ❌ not implemented (Phase 2 roadmap)
- Offline support: ❌ none (Phase 2 roadmap)
- Analytics: ❌ none
- Error Tracking: ❌ none (ErrorBoundary catches render errors locally only)
- Build/release pipeline: ❌ no EAS/build config present

## Current Bottleneck

No production build/release path. There is no EAS or store-submission config and no real `app.json` `extra` values wired for a hosted API — so the app cannot be shipped to testers' devices in a repeatable way yet. (Unit + Maestro tests exist, but the missing build pipeline is the blocker, not coverage.)

## Known Issues

- Tamagui pinned to `2.0.0-rc.41` (release candidate); Renovate auto-bumps disabled for it (dependency risk; ADR-013 🚩).
- No PR-gated e2e: Maestro flows run manual/nightly only, so UI regressions can reach a build without a gate catching them.
- No course-generation progress indicator (polling only; Phase 2).
- Requires real `supabaseUrl` / `supabasePublishableKey` / `apiBaseUrl` in `app.json` `extra` to run against a live backend.

## Next Steps

1. Add an EAS build + store-submission config; produce a testable build.
2. Add component/integration tests for the chat and course-generation flows.
3. Move Tamagui off the RC to GA `2.0.0` when it ships.
4. Wire crash/error reporting (e.g. Sentry) for real devices.

## Open Questions

- iOS, Android, or both for the first beta?
- Distribution channel for beta — TestFlight / Play Internal Testing / Expo Go?

## Confidence

- Developers: ✅ — clear structure, strong CLAUDE.md invariants, design system.
- Internal testers: ⚠️ — runs in Expo Go against a local stack; not a standalone build.
- Beta users: ⚠️ — needs a real build pipeline, hosted backend, and tests.
- Production users: ❌ — not built/submitted; RC dependency and no crash reporting.
