# Production Auth (Spec 2) — Plan B1: Anonymous Sign-In & Mobile Auth Lifecycle (Phase 1d/1f + email-upgrade)

> Completed: 2026-06-20

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users enter the app as anonymous guests (`signInAnonymously`) with a clean email-upgrade path that preserves their UUID + progress, and establish the canonical mobile auth-flow guard precedence (D8) that Spec 4's DEV_AUTO_LOGIN slots into.

**Architecture:** The mobile app gains a "Continue as guest" entry that calls Supabase `signInAnonymously()`; an anonymous session is a real session (has tokens), so it routes into `(app)` like any signed-in user, but the app tracks `isAnonymous` (read from the Supabase session `user.is_anonymous`) and shows an upgrade card in the profile screen. Upgrade is `supabase.auth.updateUser({ email, password })` — the Plan A `sync_user_from_auth` trigger (`AFTER UPDATE OF email, is_anonymous`) syncs `public.users` server-side, preserving the UUID. `app/_layout.tsx` becomes the single owner of guard precedence per spec D8, leaving an explicit (un-implemented) DEV_AUTO_LOGIN slot for Spec 4.

**Tech Stack:** Expo SDK 52 + Expo Router 4, Zustand 5 (auth store), Tamagui 2, `@supabase/supabase-js`, jest-expo + `@testing-library/react-native` (ADR-025 — Jest, not Vitest, scoped to `apps/mobile`).

**Source spec:** `docs/superpowers/specs/2026-06-18-production-auth-design.md` (Spec 2), parts **1d** (anonymous client flow), **1f / D8** (guard precedence), and the **email** half of **1b** (anon→real upgrade — `updateUser({email})`). This is **Plan B1**; the worker stale-anon cleanup is **Plan B2**. Builds on **Plan A** (provisioning triggers, live in prod). OAuth `linkIdentity` upgrade is **explicitly out of scope** (the app has no OAuth today — deferred until OAuth sign-in is added).

## Global Constraints

- **Auth tokens are owned exclusively by `src/stores/auth.store.ts`** via `expo-secure-store`; the `supabase` client keeps `persistSession: false` (`apps/mobile/CLAUDE.md`). Do not change `persistSession`.
- **`apps/mobile` calls only `services/api`** for data — never `services/agent`/`worker`, and no direct `fetch` in components. Anonymous sign-in / upgrade are **auth operations** on the `supabase` client (the one sanctioned client-side use), not data calls.
- **Tamagui only** for UI; screens import from `@/components`, `@/stores`, `@/api` (no raw Tamagui primitives in screens beyond layout `YStack`/`XStack`, matching existing screens). Use `AppText`/`Heading`/`Button`/`Input`/`Card` from `@/components`.
- **Tests are jest-expo** (`pnpm --filter @autodidact/mobile test`), NOT vitest. Mock `../lib/supabase`, `expo-router`, `expo-secure-store` at the seam; component tests use `renderWithProviders` from `src/test-utils/render.tsx`; `jest.mock()` factory vars must be prefixed `mock` (hoisting rule).
- **`is_anonymous` client source = the Supabase session `user.is_anonymous`** (boolean on the session's `user`). The app does not query the DB for it (that's the server/API's `public.users.is_anonymous`, Plan A).
- **Identity contract (Plan A / ADR-028):** upgrade preserves the user UUID — `updateUser({email})` is an UPDATE of the same `auth.users` row, so `public.users.id` is unchanged and progress carries over. Never create a new user on upgrade.
- **Local stack ports remapped +1000** (Spec 1): API `55321`, DB `55322`. The mobile app resolves `extra.supabaseUrl` from `.env.dev` via `app.config.ts`.
- **PROD anonymous sign-in is gated on Plan C (hard sequencing constraint).** B1 enables `enable_anonymous_sign_ins` on the **local stack only**. Anonymous sign-in is an abuse vector (anyone with the publishable key can mint unlimited guests → unbounded `public.users` rows + trigger load); the mitigations are IP rate-limiting + B2's stale-anonymous cleanup (CAPTCHA dropped — poor mobile UX). **Do NOT enable anonymous sign-ins on the prod project (`cbzdsoojfhpsexuyeyxt`) until Plan C's IP-rate-limit mitigation is live.** This is a release dependency, not a soft note.
- **Email-confirmation awareness:** the upgrade flow must NOT assume `updateUser({email})` takes effect immediately. Locally `enable_confirmations=false` so it does; in prod (once Plan C may enable confirmation) it sends a confirmation and the user stays anonymous server-side until confirmed. The client must derive guest status from the **server-returned user**, never optimistically (see Task 5).
- **Test mocking:** jest-expo tests must run with `expo-secure-store` mocked (the auth store's `persist` middleware writes to it). Before writing store/component tests, confirm `apps/mobile/jest-setup.ts` mocks `expo-secure-store` globally; if it does not, add a `jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))` to the setup (or per-file). `jest.mock` factory vars must be prefixed `mock`.

---

### Task 1: Enable anonymous sign-ins in the local Supabase stack config

**Files:**
- Modify: `supabase/config.toml` (line ~178, `[auth]` section)

**Interfaces:**
- Produces: a local GoTrue that accepts `signInAnonymously()`. (Without this, the client call returns a 422 "Anonymous sign-ins are disabled".)

- [x] **Step 1: Flip the toggle**

In `supabase/config.toml`, under `[auth]`, change:

```toml
enable_anonymous_sign_ins = false
```
to
```toml
enable_anonymous_sign_ins = true
```

(Leave the IP rate-limit settings at defaults — tuning those is Plan C / GoTrue hardening, not B1. `enable_confirmations` for the email provider stays at its current local value `false`, so an `updateUser({email})` upgrade takes effect immediately for local verification.)

- [x] **Step 2: Restart the stack so the setting takes effect and confirm it parsed**

```bash
pnpm exec supabase stop
pnpm exec supabase start
# Confirm GoTrue picked up the setting (it reports anonymous enablement in its config endpoint):
curl -s "http://127.0.0.1:55321/auth/v1/settings" -H "apikey: $(grep '^SUPABASE_PUBLISHABLE_KEY' .env.dev | cut -d= -f2)"
```
Expected: the stack restarts; the settings JSON reports anonymous sign-ins enabled (look for the `external` / anonymous flag — field name varies by GoTrue version). The **definitive functional check is Task 6's in-app guest flow** — do not rely on a hand-rolled signup curl here (the JS SDK's `signInAnonymously()` is the real path; reproducing it by hand is brittle).

- [x] **Step 3: Commit**

```bash
git add supabase/config.toml
git commit -m "feat(infra): enable anonymous sign-ins in the local Supabase stack (Spec 2 B1)"
```

> **PROD enablement is a Plan C release dependency — NOT done here.** Per the Global Constraint above, the prod project `cbzdsoojfhpsexuyeyxt` must NOT have anonymous sign-ins enabled until Plan C's IP-rate-limit mitigation is live (CAPTCHA dropped — poor mobile UX; rate-limit + B2 cleanup are the mitigations). When Plan C ships, enable it in prod via `supabase/config.toml` parity (or the dashboard) together with those mitigations. Record this dependency in the PR description.

---

### Task 2: Track `isAnonymous` in the auth store

**Files:**
- Modify: `apps/mobile/src/stores/auth.store.ts`
- Test: `apps/mobile/src/stores/__tests__/auth.store.test.ts` (create if absent; check `apps/mobile/src/stores/__tests__/` first and follow the existing store-test pattern)

**Interfaces:**
- Consumes: nothing new.
- Produces: `AuthState` gains `isAnonymous: boolean` (default `false`); `setSession(accessToken, refreshToken, isAnonymous?: boolean)` accepts an optional third arg (defaults `false`); `clearSession()` resets `isAnonymous` to `false`. Persisted under the existing `autodidact-auth` key.

- [x] **Step 1: Write the failing test**

Create/extend `apps/mobile/src/stores/__tests__/auth.store.test.ts`:

```typescript
import { useAuthStore } from '../auth.store';

beforeEach(() => {
  useAuthStore.getState().clearSession();
});

test('setSession defaults isAnonymous to false', () => {
  useAuthStore.getState().setSession('a', 'r');
  expect(useAuthStore.getState().isAnonymous).toBe(false);
  expect(useAuthStore.getState().accessToken).toBe('a');
});

test('setSession records an anonymous session', () => {
  useAuthStore.getState().setSession('a', 'r', true);
  expect(useAuthStore.getState().isAnonymous).toBe(true);
});

test('clearSession resets isAnonymous', () => {
  useAuthStore.getState().setSession('a', 'r', true);
  useAuthStore.getState().clearSession();
  expect(useAuthStore.getState().isAnonymous).toBe(false);
  expect(useAuthStore.getState().accessToken).toBeNull();
});
```

- [x] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @autodidact/mobile test auth.store`
Expected: FAIL — `isAnonymous` is undefined / `setSession` ignores the third arg.

- [x] **Step 3: Update the store**

In `apps/mobile/src/stores/auth.store.ts`, add `isAnonymous` to the interface and state:

```typescript
interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  isAnonymous: boolean;
  setSession: (accessToken: string, refreshToken: string, isAnonymous?: boolean) => void;
  setUser: (user: UserProfile) => void;
  clearSession: () => void;
}
```

In the `create(...)` initializer:

```typescript
      accessToken: null,
      refreshToken: null,
      user: null,
      isAnonymous: false,
      setSession: (accessToken, refreshToken, isAnonymous = false) =>
        set({ accessToken, refreshToken, isAnonymous }),
      setUser: (user) => set({ user }),
      clearSession: () => set({ accessToken: null, refreshToken: null, user: null, isAnonymous: false }),
```

- [x] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @autodidact/mobile test auth.store`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/mobile/src/stores/auth.store.ts apps/mobile/src/stores/__tests__/auth.store.test.ts
git commit -m "feat(mobile): track isAnonymous in the auth store (Spec 2 B1)"
```

---

### Task 3: `_layout.tsx` — capture `isAnonymous` from the session + canonical guard precedence (D8)

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `setSession(accessToken, refreshToken, isAnonymous?)` (Task 2).
- Produces: the `onAuthStateChange` handler passes `session.user?.is_anonymous` into `setSession`; the guard order is documented per D8 with an explicit DEV_AUTO_LOGIN placeholder comment for Spec 4. No behavior change for already-signed-in real users.

- [x] **Step 1: Update the session-sync to capture `is_anonymous`**

In `apps/mobile/app/_layout.tsx`, change the `onAuthStateChange` effect body:

```typescript
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token && session?.refresh_token) {
        setSession(session.access_token, session.refresh_token, session.user?.is_anonymous ?? false);
      } else {
        clearSession();
      }
    });
    return () => subscription.unsubscribe();
  }, [setSession, clearSession]);
```

- [x] **Step 2: Document the canonical guard precedence (D8) with the Spec 4 slot**

Replace the guard effect (the `inAuthGroup` effect) with the canonical-order version. An anonymous session has tokens, so it routes into `(app)` exactly like a real session — the only difference is the upgrade card (Task 5). Add the precedence comment + the explicit DEV_AUTO_LOGIN placeholder:

```typescript
  // Canonical auth-flow precedence (Spec 2, D8 — this file is the single owner):
  //   1. Persisted session restored above → autoRefresh keeps it alive.
  //   2. Session present (real OR anonymous) → route into (app).
  //   3. No session + __DEV__ + extra.devAutoLogin → DEV_AUTO_LOGIN slot (Spec 4).
  //      Spec 4 implements this slot; it takes precedence over the guest path in
  //      dev so the two never both fire. Intentionally NOT implemented in B1.
  //   4. Otherwise → auth UI ((auth) group), which offers real sign-in/up AND
  //      "Continue as guest" (signInAnonymously).
  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    if (!accessToken && !inAuthGroup) {
      // Spec 4 DEV_AUTO_LOGIN slot goes here (before the redirect to auth UI).
      router.replace('/(auth)/sign-in');
    } else if (accessToken && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [accessToken, segments, router]);
```

- [x] **Step 3: Verify typecheck**

Run: `pnpm --filter @autodidact/mobile typecheck`
Expected: passes. (`session.user.is_anonymous` is typed by `@supabase/supabase-js`'s `User`.)

> **Test-coverage boundary (deliberate):** the routing *precedence* (expo-router `router.replace` redirects driven by `segments`) is not unit-tested here — per ADR-025, routing/UI flows are covered by Maestro e2e + manual verification, not jest. The one new piece of *logic* (capturing `session.user?.is_anonymous` into the store) is exercised end-to-end by Task 4's guest flow (store assertion) and Task 6 (in-app + restart). Do not add a brittle full-`RootLayout` render test for the redirects.

- [x] **Step 4: Commit**

```bash
git add apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): capture is_anonymous in session sync + canonical D8 guard precedence (Spec 2 B1)"
```

---

### Task 4: "Continue as guest" entry on the sign-in screen

**Files:**
- Modify: `apps/mobile/app/(auth)/sign-in.tsx`
- Test: `apps/mobile/app/(auth)/__tests__/sign-in.test.tsx` (create if absent; check for an existing sign-in test first and follow its pattern)

**Interfaces:**
- Consumes: `setSession(accessToken, refreshToken, isAnonymous?)` (Task 2); the `supabase` client.
- Produces: a `handleGuest` handler calling `supabase.auth.signInAnonymously()` and a "Continue as guest" `Button`.

- [x] **Step 1: Write the failing component test**

Create `apps/mobile/app/(auth)/__tests__/sign-in.test.tsx`. Mock the supabase client and assert the guest button calls `signInAnonymously` and stores the session as anonymous:

```typescript
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils/render';

const mockSignInAnonymously = jest.fn();
const mockSignInWithPassword = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: {
    signInAnonymously: (...a: unknown[]) => mockSignInAnonymously(...a),
    signInWithPassword: (...a: unknown[]) => mockSignInWithPassword(...a),
  } },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));

import SignInScreen from '../sign-in';
import { useAuthStore } from '@/stores/auth.store';

beforeEach(() => {
  mockSignInAnonymously.mockReset();
  useAuthStore.getState().clearSession();
});

test('Continue as guest signs in anonymously and records an anonymous session', async () => {
  mockSignInAnonymously.mockResolvedValue({
    data: { session: { access_token: 'at', refresh_token: 'rt', user: { is_anonymous: true } } },
    error: null,
  });
  const { getByText } = renderWithProviders(<SignInScreen />);
  fireEvent.press(getByText('Continue as guest'));
  await waitFor(() => expect(mockSignInAnonymously).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(useAuthStore.getState().isAnonymous).toBe(true));
  expect(useAuthStore.getState().accessToken).toBe('at');
});
```

- [x] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @autodidact/mobile test sign-in`
Expected: FAIL — no "Continue as guest" button.

- [x] **Step 3: Add the guest handler + button**

In `apps/mobile/app/(auth)/sign-in.tsx`, add a separate `guestLoading` state (so the guest button and the Sign-In button don't spin together) and a guest handler alongside `handleSignIn`:

```typescript
  const [guestLoading, setGuestLoading] = useState(false);

  const handleGuest = async () => {
    setGuestLoading(true);
    const { data, error } = await supabase.auth.signInAnonymously();
    setGuestLoading(false);
    if (error) {
      Alert.alert('Could not continue as guest', error.message);
      return;
    }
    if (data.session?.access_token && data.session?.refresh_token) {
      setSession(data.session.access_token, data.session.refresh_token, data.session.user?.is_anonymous ?? true);
    }
  };
```

Add the button after the "Sign up" ghost button (inside the same `YStack`):

```tsx
        <Button variant="ghost" size="sm" loading={guestLoading} onPress={handleGuest}>
          Continue as guest
        </Button>
```

- [x] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @autodidact/mobile test sign-in`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/sign-in.tsx apps/mobile/app/\(auth\)/__tests__/sign-in.test.tsx
git commit -m "feat(mobile): add Continue-as-guest anonymous sign-in (Spec 2 B1)"
```

---

### Task 5: Email-upgrade card on the profile screen (anon → real)

**Files:**
- Create: `apps/mobile/src/components/auth/UpgradeAccountCard.tsx`
- Modify: `apps/mobile/src/components/index.ts` (export the new component — confirm the barrel path/pattern first)
- Modify: `apps/mobile/app/(app)/profile.tsx`
- Test: `apps/mobile/src/components/auth/__tests__/UpgradeAccountCard.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (`isAnonymous`, `accessToken`, `refreshToken`, `setSession`); the `supabase` client.
- Produces: `UpgradeAccountCard` — renders only for anonymous users; collects email + password, calls `supabase.auth.updateUser({ email, password })`, and reconciles local guest status from the **server-returned user** (`data.user.is_anonymous`), NOT optimistically. If the server reports a pending email confirmation (`data.user.new_email` present, or still `is_anonymous`), it shows a "confirm your email" message and the card stays visible until the user is actually upgraded. The UUID is preserved (server trigger syncs `public.users`).

> **Why not optimistic (the confirmation gap):** with email confirmation OFF (local) `updateUser({email})` upgrades immediately; with it ON (prod, once Plan C may enable it) the email is pending until confirmed and the user is still anonymous server-side. Flipping `isAnonymous=false` blindly would hide the card and falsely claim success while `public.users.is_anonymous` is still `true`. So we trust `data.user.is_anonymous` from the response.

- [x] **Step 1: Write the failing component test**

Create `apps/mobile/src/components/auth/__tests__/UpgradeAccountCard.test.tsx`:

```typescript
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils/render';

const mockUpdateUser = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { updateUser: (...a: unknown[]) => mockUpdateUser(...a) } },
}));

import { UpgradeAccountCard } from '../UpgradeAccountCard';
import { useAuthStore } from '@/stores/auth.store';

beforeEach(() => {
  mockUpdateUser.mockReset();
  useAuthStore.getState().clearSession();
});

test('renders nothing for a non-anonymous user', () => {
  useAuthStore.getState().setSession('at', 'rt', false);
  const { queryByText } = renderWithProviders(<UpgradeAccountCard />);
  expect(queryByText('Save your account')).toBeNull();
});

test('confirmation OFF: server returns non-anonymous → clears guest state', async () => {
  useAuthStore.getState().setSession('at', 'rt', true);
  mockUpdateUser.mockResolvedValue({ data: { user: { id: 'u1', is_anonymous: false } }, error: null });
  const { getByText, getByPlaceholderText } = renderWithProviders(<UpgradeAccountCard />);
  fireEvent.changeText(getByPlaceholderText('you@example.com'), 'new@user.dev');
  fireEvent.changeText(getByPlaceholderText('Choose a password'), 'Secret123!');
  fireEvent.press(getByText('Save your account'));
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'new@user.dev', password: 'Secret123!' }));
  await waitFor(() => expect(useAuthStore.getState().isAnonymous).toBe(false));
});

test('confirmation PENDING: server still anonymous w/ new_email → stays a guest', async () => {
  useAuthStore.getState().setSession('at', 'rt', true);
  // Email confirmation required: email is pending, user is still anonymous server-side.
  mockUpdateUser.mockResolvedValue({ data: { user: { id: 'u1', is_anonymous: true, new_email: 'new@user.dev' } }, error: null });
  const { getByText, getByPlaceholderText } = renderWithProviders(<UpgradeAccountCard />);
  fireEvent.changeText(getByPlaceholderText('you@example.com'), 'new@user.dev');
  fireEvent.changeText(getByPlaceholderText('Choose a password'), 'Secret123!');
  fireEvent.press(getByText('Save your account'));
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
  // Must NOT optimistically clear guest state — the upgrade isn't complete until confirmed.
  await waitFor(() => expect(useAuthStore.getState().isAnonymous).toBe(true));
});
```

- [x] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @autodidact/mobile test UpgradeAccountCard`
Expected: FAIL — component does not exist.

- [x] **Step 3: Implement the component**

Create `apps/mobile/src/components/auth/UpgradeAccountCard.tsx` (use only `@/components` primitives + Tamagui layout, matching existing screens):

```tsx
import { useState } from 'react';
import { Alert } from 'react-native';
import { YStack } from 'tamagui';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import { Card, AppText, Input, Button } from '@/components';

export function UpgradeAccountCard() {
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isAnonymous) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.updateUser({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Could not save your account', error.message);
      return;
    }
    // Reconcile from the SERVER-returned user, never optimistically. With email
    // confirmation ON (prod) the user stays anonymous until they confirm; with it
    // OFF (local) the upgrade is immediate. Same UUID either way; the
    // sync_user_from_auth trigger updates public.users when the email lands.
    const stillAnonymous = data.user?.is_anonymous ?? false;
    const pendingEmail = (data.user as { new_email?: string } | undefined)?.new_email;
    if (accessToken && refreshToken) setSession(accessToken, refreshToken, stillAnonymous);
    if (stillAnonymous || pendingEmail) {
      Alert.alert(
        'Confirm your email',
        `We sent a confirmation link to ${pendingEmail ?? email}. Confirm it to finish linking your account and keep your progress.`,
      );
    } else {
      Alert.alert('Account saved', 'Your progress is now linked to your email.');
    }
  };

  return (
    <Card variant="elevated">
      <AppText variant="label">Save your account</AppText>
      <AppText variant="muted">You're browsing as a guest. Add an email to keep your progress.</AppText>
      <YStack marginTop="$3" gap="$3">
        <Input
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input
          label="Password"
          placeholder="Choose a password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Button variant="primary" size="lg" loading={loading} onPress={handleUpgrade}>
          Save your account
        </Button>
      </YStack>
    </Card>
  );
}
```

Export it from the components barrel — open `apps/mobile/src/components/index.ts`, confirm the export style, and add `export { UpgradeAccountCard } from './auth/UpgradeAccountCard';` (match whatever grouping/style the barrel uses).

- [x] **Step 4: Render it on the profile screen**

In `apps/mobile/app/(app)/profile.tsx`, import `UpgradeAccountCard` from `@/components` and render it inside the top `YStack` (e.g. above the "Email" card) so guests see the prompt and real users see nothing (the component self-hides):

```tsx
import { Screen, Card, AppText, Button, UpgradeAccountCard } from '@/components';
// ...
        <UpgradeAccountCard />
```

- [x] **Step 5: Run the test + typecheck**

Run: `pnpm --filter @autodidact/mobile test UpgradeAccountCard && pnpm --filter @autodidact/mobile typecheck`
Expected: tests PASS; typecheck clean.

- [x] **Step 6: Commit**

```bash
git add apps/mobile/src/components/auth/UpgradeAccountCard.tsx apps/mobile/src/components/index.ts apps/mobile/app/\(app\)/profile.tsx apps/mobile/src/components/auth/__tests__/UpgradeAccountCard.test.tsx
git commit -m "feat(mobile): email-upgrade card for anonymous users (Spec 2 B1)"
```

---

### Task 6: End-to-end verification against the local stack (email-upgrade round-trip)

**Files:** none (manual/scripted verification). **Precondition:** local stack up (`pnpm exec supabase start`), backend running (`pnpm dev`), app on the emulator (`pnpm mobile:run`). This is the spec **1b email-path acceptance test**.

- [x] **Step 1: Guest sign-in lands in local `auth.users`**

In the app, tap **Continue as guest**. Then:
```bash
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -c "select id, email, is_anonymous from auth.users where is_anonymous = true order by created_at desc limit 1;"
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -c "select id, email, is_anonymous from public.users where is_anonymous = true order by created_at desc limit 1;"
```
Expected: one anonymous row in **both** tables with the **same id** (Plan A trigger provisioned `public.users`), `email` NULL, `is_anonymous = true`.

- [x] **Step 2: Upgrade preserves the UUID and syncs email (the 1b acceptance test)**

Note the guest's `id` from Step 1. In the app, go to **Profile → Save your account**, enter an email + password, submit. Then:
```bash
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -c "select id, email, is_anonymous from public.users where id = '<guest-id-from-step-1>';"
```
Expected: **same `id`**, `email` now set, `is_anonymous = false` — proving the upgrade preserved the UUID and the `sync_user_from_auth` trigger fired (email path). Progress rows (if the guest enrolled before upgrading) remain attached to the same `id`.

- [x] **Step 3: Verify the anonymous session survives an app restart**

Before upgrading, with a guest session active, **fully close and reopen the app** (or reload Metro). Confirm: the app does NOT bounce to the sign-in screen (the persisted session restores), it lands in `(app)`, and **Profile still shows the upgrade card** (i.e. `isAnonymous` rehydrated true). This exercises the persist→restore→`onAuthStateChange` round-trip for the new `isAnonymous` field — the state path most likely to regress.

- [x] **Step 4: Clean up the test user**

```bash
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -c "delete from public.users where id = '<guest-id>'; delete from auth.users where id = '<guest-id>';"
```

> **Recorded scope:** this verifies the **email** upgrade path (`updateUser({email})`) with **local `enable_confirmations=false`** (immediate upgrade). The **confirmation-ON** behavior (prod) — where the card stays until the user confirms — is exercised by the Task 5 unit test but is only verifiable against real prod GoTrue at deploy time (the local stack has confirmations off). The **OAuth `linkIdentity`** path is deferred (no OAuth in the app yet); its trigger-coverage verification + any `auth.identities` fallback stays OPEN in ADR-028's follow-ups until OAuth sign-in is added.

---

### Task 7: Docs — mobile auth lifecycle

**Files:**
- Modify: `apps/mobile/README.md`
- Modify: `apps/mobile/CLAUDE.md` (Auth invariants / Entry points)

- [x] **Step 1: Document the anonymous lifecycle**

In `apps/mobile/CLAUDE.md` under **Auth**, add: anonymous sign-in via `supabase.auth.signInAnonymously()` ("Continue as guest" on sign-in); `isAnonymous` lives in `auth.store` (sourced from the Supabase session `user.is_anonymous`); upgrade via `supabase.auth.updateUser({ email, password })` from `UpgradeAccountCard` (preserves UUID; server trigger syncs `public.users`); `app/_layout.tsx` owns the D8 guard precedence (restore → session⇒(app) → DEV_AUTO_LOGIN slot [Spec 4] → auth UI). In `apps/mobile/README.md`, add a short "Guest / anonymous accounts" note pointing at the same.

- [x] **Step 2: Verify no stale claims**

Run: `grep -rn "email/password only\|no anonymous" apps/mobile/README.md apps/mobile/CLAUDE.md || echo "none"`
Expected: none (or fix any line that now contradicts anonymous support).

- [x] **Step 3: Commit**

```bash
git add apps/mobile/README.md apps/mobile/CLAUDE.md
git commit -m "docs(mobile): document anonymous sign-in + upgrade lifecycle (Spec 2 B1)"
```

---

## Verification (end-to-end, Plan B1)

```bash
pnpm --filter @autodidact/mobile test        # all jest-expo suites green (store, sign-in, upgrade card)
pnpm --filter @autodidact/mobile typecheck   # clean
# Manual (Task 6): guest sign-in → row in local auth.users + public.users (same id, is_anonymous=true);
# upgrade → same id, email set, is_anonymous=false (UUID + progress preserved).
```

**Done when:** "Continue as guest" creates an anonymous session that routes into `(app)`; the profile screen shows the upgrade card only for guests; an email upgrade preserves the UUID and flips `is_anonymous` to false (verified against the local stack); `_layout.tsx` documents the D8 precedence with the Spec 4 slot; all jest-expo tests + typecheck pass.

## Self-review notes (spec coverage)

- 1d anonymous client flow → Tasks 1 (config), 4 (guest entry), 5 (upgrade). 1f/D8 guard precedence → Task 3. 1b **email** upgrade path + acceptance test → Tasks 5 + 6.
- **Critique fixes applied:** confirmation-aware upgrade (reconcile `isAnonymous` from the server-returned user, handle confirmation-pending — Task 5, with both branches tested); PROD anonymous enablement made a hard Plan-C release dependency (Global Constraints + Task 1); `expo-secure-store` test-mock requirement (Global Constraints); separate `guestLoading` (Task 4); app-restart rehydration verification (Task 6); routing-coverage boundary stated (Task 3); unreliable Task 1 curl removed.
- **Deferred by design:** OAuth `linkIdentity` upgrade + `auth.identities` fallback (no OAuth in app — ADR-028 follow-up stays open); IP-rate-limit + prod anonymous enablement (Plan C / GoTrue hardening; no CAPTCHA); confirmation-ON prod behavior verified only at deploy time (local has confirmations off); DEV_AUTO_LOGIN (Spec 4 — B1 leaves the slot); stale-anonymous cleanup (Plan B2).
