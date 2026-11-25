# Frontend Architecture

## Routing

Expo Router 4 provides file-system routing. Every file under `app/` is a route; no manual navigator config is needed.

```
app/
├── _layout.tsx                          # Root layout (providers + auth guard)
├── (auth)/
│   ├── sign-in.tsx                      # /sign-in
│   └── sign-up.tsx                      # /sign-up
└── (app)/
    ├── _layout.tsx                      # Stack: the tabs, then course and lesson screens above them
    ├── (tabs)/
    │   ├── _layout.tsx                  # Tab bar: Home, New course, Profile
    │   ├── index.tsx                    # / (Home)
    │   ├── create.tsx                   # /create
    │   └── profile.tsx                  # /profile
    └── courses/[id]/
        ├── index.tsx                    # /courses/:id
        └── modules/[moduleId]/
            └── chat.tsx                 # /courses/:id/modules/:moduleId/chat
```

Parentheses groups `(auth)`, `(app)` and `(tabs)` are route segments that don't appear in the URL. They exist to scope layouts. Course and lesson screens sit in the stack above `(tabs)`, so they open full screen with a back button and no tab bar over the chat composer.

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

`app/(app)/_layout.tsx` (stack) and `app/(app)/(tabs)/_layout.tsx` (tab bar) read React Navigation's colors from `useThemeColors()` (`src/lib/theme-colors.ts`), the one place the tokens exist as values for APIs that take no className.

## Screens

| File | Purpose |
|------|---------|
| `(auth)/sign-in.tsx` | Google, Facebook, email (folded) and guest sign-in |
| `(auth)/sign-up.tsx` | Email sign-up and the "check your email" step |
| `(app)/(tabs)/index.tsx` | Home: continue card into the next module, every course with progress, building/failed states |
| `(app)/(tabs)/create.tsx` | New course: topic, level, time; returns Home while the course builds |
| `(app)/(tabs)/profile.tsx` | Account, stats, guest upgrade, sign out |
| `(app)/courses/[id]/index.tsx` | Course: progress, start/continue, module list with states |
| `(app)/courses/[id]/modules/[moduleId]/chat.tsx` | Lesson: module intro, the chat with the teacher, completion card with the next module |

## Conventions

- Screens import only from `@/components` and `@/stores` / `@/api`. No raw styled primitives in screen files; use plain RN `View`/`Text` with `className` for one-off layout.
- Navigation params come from `useLocalSearchParams<{ id: string }>()`.
- No `StyleSheet.create` for layout or styling. All styling is NativeWind `className`. Inline `style` only for runtime-dynamic values (progress widths, safe-area insets, RN nav `screenOptions`).
