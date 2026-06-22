# Frontend Architecture

## Routing

Expo Router 4 provides file-system routing. Every file under `app/` is a route; no manual navigator config is needed.

```
app/
├── _layout.tsx                          # Root layout (providers + auth guard)
├── (auth)/
│   └── sign-in.tsx                      # /sign-in
└── (app)/
    ├── _layout.tsx                      # Tab navigator
    ├── index.tsx                        # / (Dashboard)
    ├── profile.tsx                      # /profile
    ├── courses/
    │   ├── index.tsx                    # /courses
    │   └── [id]/
    │       ├── index.tsx                # /courses/:id
    │       └── modules/[moduleId]/
    │           └── chat.tsx             # /courses/:id/modules/:moduleId/chat
```

Parentheses groups `(auth)` and `(app)` are route segments that don't appear in the URL. They exist to scope layouts.

## Provider stack

`app/_layout.tsx` owns the root NativeWind wrapper, the global providers, and the auth guard:

```
View (NativeWind dark-mode root — carries 'dark' class when useColorScheme() === 'dark')
  └── QueryClientProvider (staleTime 30s, retry 1)
        └── Slot (rendered route)
```

The auth guard runs inside `_layout.tsx` via three `useEffect` hooks:

1. **Session restoration** (runs once on mount): if `accessToken` and `refreshToken` are in the store (persisted from a prior session), calls `supabase.auth.setSession()` to re-hydrate Supabase's in-memory session. This enables `autoRefreshToken` without requiring a full sign-in on app restart.
2. **`onAuthStateChange` listener**: syncs Supabase auth events (token refresh, sign-out) into the store by calling `setSession` or `clearSession`.
3. **Route guard**: watches `accessToken` + `segments` → redirects between `(auth)` and `(app)` using `router.replace`.

`app/(app)/_layout.tsx` renders the tab bar. It passes hardcoded tintColor hex values to React Navigation's `screenOptions` (inline `style` — no Tailwind equivalent for RN nav props).

## Screens

| File | Purpose |
|------|---------|
| `(auth)/sign-in.tsx` | Email/password sign-in form |
| `(app)/index.tsx` | Dashboard: welcome, quick-start course generation |
| `(app)/courses/index.tsx` | Course list with progress indicators |
| `(app)/courses/[id]/index.tsx` | Course detail: module list, per-module progress |
| `(app)/courses/[id]/modules/[moduleId]/chat.tsx` | AI tutor chat for a module |
| `(app)/profile.tsx` | User profile display |

## Conventions

- Screens import only from `@/components` and `@/stores` / `@/api`. No raw styled primitives in screen files; use plain RN `View`/`Text` with `className` for one-off layout.
- Navigation params come from `useLocalSearchParams<{ id: string }>()`.
- No `StyleSheet.create` for layout or styling. All styling is NativeWind `className`. Inline `style` only for runtime-dynamic values (progress widths, safe-area insets, RN nav `screenOptions`).
