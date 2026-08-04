# Subtree Instructions — services/api/src/modules/auth/

> These rules apply only within `services/api/src/modules/auth/`. They extend `services/api/AGENTS.md`.

## Purpose of this subtree

The auth module is a guard-only module. It exposes no HTTP routes. Its sole responsibilities are:
- Providing `AuthGuard`, which extracts the Bearer token and calls `IAuthProvider.verifyToken()`
- Providing the auth provider instance under `AUTH_PROVIDER_TOKEN`
- Exporting both so all other modules can inject the guard and the provider token

---

## Invariants (must not be broken)

- This module exposes **no HTTP routes** — do not add a controller here
- `IAuthProvider` (from `@autodidact/providers`) is the only extension point for swapping auth backends; `AuthGuard` depends on the interface, never on a concrete class
- `AuthUser` (from `@autodidact/types`) is the canonical shape for authenticated user context — it is written to `request.user` by `AuthGuard` and read by `@CurrentUser()`. Do not add, remove, or rename fields on `AuthUser` without updating every consumer in the codebase
- `AuthModule` is decorated `@Global()` — it must remain global so `AuthGuard` is injectable everywhere without re-importing `AuthModule`
- `AuthGuard` is applied at the **controller level** with `@UseGuards(AuthGuard)`. Do not switch to a global `APP_GUARD` registration without auditing that `/health` remains unguarded
- To swap the auth backend: implement `IAuthProvider` in `packages/providers`, update `createAuthProvider()` to return the new implementation, and set `AUTH_PROVIDER` env var as needed. No changes to this module are required

---

## Source of truth

- Provider interface: `IAuthProvider` in `packages/providers/src/`
- Auth user shape: `AuthUser` in `@autodidact/types`
- Token constant: `AUTH_PROVIDER_TOKEN` in `src/providers.token.ts`
