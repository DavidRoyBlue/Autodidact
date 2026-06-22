# Social Sign-In Phase 1 (Google + Facebook) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google (native) and Facebook (web-PKCE) as the headline sign-in methods on the mobile auth screen, keeping email/password (demoted) and "continue as guest".

**Architecture:** A `src/lib/social-auth.ts` seam exposes `configureGoogleSignin()`, `signInWithGoogle()`, `signInWithFacebook()` so the UI and store don't care which mechanism a provider uses. Google → `@react-native-google-signin` → `supabase.auth.signInWithIdToken`. Facebook → `supabase.auth.signInWithOAuth({skipBrowserRedirect})` → `expo-web-browser` `openAuthSessionAsync` → `exchangeCodeForSession`. Backend is unchanged (the `handle_new_user` trigger + JWKS verification are provider-agnostic). Requires a custom dev build (native Google can't run in Expo Go).

**Tech Stack:** Expo SDK 52, React Native 0.76.3, `@supabase/supabase-js` ^2.46, `@react-native-google-signin/google-signin`, `expo-web-browser`, `expo-linking`, `expo-dev-client`; Jest (jest-expo) + `@testing-library/react-native`.

**Source spec:** `docs/superpowers/specs/to-be-reviewed/2026-06-22-social-sign-in-design.md` (Phase 1).

## Global Constraints

- **`apps/mobile` auth invariant:** the `supabase` client keeps `persistSession: false`; the **auth store** (`src/stores/auth.store.ts`) owns session persistence via `expo-secure-store`. The new PKCE storage adapter is for supabase-js's own flow state only (D3) — it does not change session ownership.
- **Guard precedence is owned solely by `app/_layout.tsx`** (Spec 2 D8). A social session is just a session; do **not** add competing redirect guards. An OAuth success is picked up by the existing `onAuthStateChange` listener.
- **Testing = Jest, not Vitest** (ADR-025), scoped to `apps/mobile`. Mock at the seam; `jest.mock()` factory vars MUST be prefixed `mock` (hoisting). Component tests use `renderWithProviders` from `src/test-utils/render.tsx`. Run: `pnpm --filter @autodidact/mobile test`.
- **Tamagui only**; screens import only from `@/components`, `@/stores`, `@/lib`, `@/api` — no raw RN styling.
- **Backend: no changes.** No `services/*`, no `packages/db`, no migration.
- **Guest → OAuth upgrade (`linkIdentity`) is OUT OF SCOPE** (Phase 2, per spec D5).
- **Config-only deps add a native module** → the app must be run on a **custom dev build**, not Expo Go (Task 1 + Task 7).

---

### Task 1: Dependencies, Expo config plugin, and `extra` provider IDs

**Files:**
- Modify: `apps/mobile/package.json` (deps)
- Modify: `apps/mobile/app.config.ts` (plugin + `extra` ids)

**Interfaces:**
- Produces: installed `@react-native-google-signin/google-signin`, `expo-web-browser`, `expo-linking`, `expo-dev-client`; `Constants.expoConfig.extra.googleWebClientId` and `.facebookEnabled` resolvable at runtime.

- [ ] **Step 1: Install the dependencies**

```bash
# SDK-pinned Expo packages
pnpm --filter @autodidact/mobile exec expo install expo-web-browser expo-linking expo-dev-client
# Native Google SDK (not an Expo package — install directly)
pnpm --filter @autodidact/mobile add @react-native-google-signin/google-signin
```

- [ ] **Step 2: Register the config plugin + provider IDs in `app.config.ts`**

Replace the `export default` block in `apps/mobile/app.config.ts` so it adds the Google plugin and the new `extra` keys (env-driven, mirroring the existing Supabase keys):

```ts
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Autodidact',
  slug: config.slug ?? 'autodidact',
  plugins: [
    ...(config.plugins ?? []),
    'expo-router',
    '@react-native-google-signin/google-signin',
  ],
  extra: {
    ...config.extra,
    apiBaseUrl:
      process.env.AUTODIDACT_API_BASE_URL ??
      (config.extra?.apiBaseUrl as string | undefined) ??
      'http://localhost:3000/v1',
    supabaseUrl:
      process.env.SUPABASE_URL ??
      (config.extra?.supabaseUrl as string | undefined),
    supabasePublishableKey:
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      (config.extra?.supabasePublishableKey as string | undefined),
    // Google OAuth *Web* client ID (the audience the Supabase id-token exchange
    // expects) — distinct from the Android client IDs of D6a (those bind by SHA-1
    // in the Google Cloud console, not here). Facebook is enabled in the Supabase
    // dashboard; the app only needs to know it's available.
    googleWebClientId:
      process.env.GOOGLE_WEB_CLIENT_ID ??
      (config.extra?.googleWebClientId as string | undefined),
    facebookEnabled:
      (process.env.FACEBOOK_ENABLED ?? config.extra?.facebookEnabled) === 'true' ||
      config.extra?.facebookEnabled === true,
  },
});
```

> If `expo-router` is already auto-included via the `main: "expo-router/entry"` field and listing it errors as a duplicate, drop the `'expo-router'` line — only `'@react-native-google-signin/google-signin'` is required here.

- [ ] **Step 3: Add the env keys to `.env.example`**

Append to the repo-root `.env.example` (and your local `.env.dev`):

```
# Mobile social sign-in (Phase 1)
GOOGLE_WEB_CLIENT_ID=
FACEBOOK_ENABLED=false
```

- [ ] **Step 4: Verify typecheck + deps resolve**

Run: `pnpm --filter @autodidact/mobile typecheck`
Expected: passes. Confirm imports resolve:
```bash
node -e "require.resolve('@react-native-google-signin/google-signin',{paths:['apps/mobile']}); require.resolve('expo-web-browser',{paths:['apps/mobile']}); console.log('deps resolve')"
```
Expected: `deps resolve`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.config.ts pnpm-lock.yaml .env.example
git commit -m "feat(mobile): add social-signin deps + Google config plugin + provider extra ids"
```

---

### Task 2: Supabase client — PKCE flow + SecureStore storage adapter

**Files:**
- Modify: `apps/mobile/src/lib/supabase.ts`
- Test: `apps/mobile/src/lib/__tests__/supabase.test.ts` (create)

**Interfaces:**
- Produces: `pkceStorage` (exported `{ getItem, setItem, removeItem }` delegating to `expo-secure-store`); the `supabase` client created with `flowType: 'pkce'` and `storage: pkceStorage`.
- Consumes: `expo-secure-store` (already globally mocked in `jest-setup.ts`).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/lib/__tests__/supabase.test.ts`:

```ts
import * as SecureStore from 'expo-secure-store';
import { pkceStorage } from '../supabase';

describe('pkceStorage adapter (supabase-js PKCE/flow state)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getItem delegates to SecureStore.getItemAsync', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('v');
    await expect(pkceStorage.getItem('k')).resolves.toBe('v');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('k');
  });

  it('setItem delegates to SecureStore.setItemAsync', async () => {
    await pkceStorage.setItem('k', 'v');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('k', 'v');
  });

  it('removeItem delegates to SecureStore.deleteItemAsync', async () => {
    await pkceStorage.removeItem('k');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('k');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @autodidact/mobile test supabase`
Expected: FAIL — `pkceStorage` is not exported.

- [ ] **Step 3: Implement — add the adapter + PKCE to the client**

Replace `apps/mobile/src/lib/supabase.ts` with:

```ts
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;

// supabase-js needs durable storage for its own PKCE/flow state (the code-verifier
// must survive the Facebook OAuth browser round-trip). This is NOT the app session —
// the auth store still owns that (persistSession stays false). See apps/mobile CLAUDE.md.
export const pkceStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  extra?.['supabaseUrl'] ?? '',
  extra?.['supabasePublishableKey'] ?? '',
  {
    auth: {
      autoRefreshToken: true,
      // Session persistence is handled by our auth store via expo-secure-store.
      persistSession: false,
      detectSessionInUrl: false,
      // PKCE for the Facebook web OAuth flow; the verifier persists via pkceStorage.
      flowType: 'pkce',
      storage: pkceStorage,
    },
  },
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @autodidact/mobile test supabase`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/supabase.ts apps/mobile/src/lib/__tests__/supabase.test.ts
git commit -m "feat(mobile): PKCE flow + SecureStore adapter on supabase client (FB OAuth round-trip)"
```

---

### Task 3: Seam — `configureGoogleSignin()` + `signInWithGoogle()`

**Files:**
- Create: `apps/mobile/src/lib/social-auth.ts`
- Test: `apps/mobile/src/lib/__tests__/social-auth.google.test.ts` (create)

**Interfaces:**
- Produces:
  - `interface SocialSession { accessToken: string; refreshToken: string }`
  - `configureGoogleSignin(): void` — calls `GoogleSignin.configure({ webClientId })` from `extra.googleWebClientId`.
  - `signInWithGoogle(): Promise<SocialSession | null>` — `null` = user cancelled; throws `Error` on real failure.
- Consumes: `@react-native-google-signin/google-signin`, `@/lib/supabase` (`supabase`), `expo-constants`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/lib/__tests__/social-auth.google.test.ts`:

```ts
const mockHasPlayServices = jest.fn();
const mockSignIn = jest.fn();
const mockConfigure = jest.fn();
const mockIsSuccessResponse = jest.fn();
const mockSignInWithIdToken = jest.fn();

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...a: unknown[]) => mockConfigure(...a),
    hasPlayServices: (...a: unknown[]) => mockHasPlayServices(...a),
    signIn: (...a: unknown[]) => mockSignIn(...a),
  },
  isSuccessResponse: (...a: unknown[]) => mockIsSuccessResponse(...a),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithIdToken: (...a: unknown[]) => mockSignInWithIdToken(...a) } },
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { googleWebClientId: 'web-123' } } }));

import { configureGoogleSignin, signInWithGoogle } from '../social-auth';

beforeEach(() => {
  jest.clearAllMocks();
  mockHasPlayServices.mockResolvedValue(true);
});

test('configureGoogleSignin passes the web client id from extra', () => {
  configureGoogleSignin();
  expect(mockConfigure).toHaveBeenCalledWith({ webClientId: 'web-123' });
});

test('signInWithGoogle checks Play Services, exchanges the id token, returns the session', async () => {
  mockSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'idtok' } });
  mockIsSuccessResponse.mockReturnValue(true);
  mockSignInWithIdToken.mockResolvedValue({
    data: { session: { access_token: 'at', refresh_token: 'rt' } },
    error: null,
  });

  const result = await signInWithGoogle();

  expect(mockHasPlayServices).toHaveBeenCalled();
  expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'idtok' });
  expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
});

test('signInWithGoogle returns null when the user cancels', async () => {
  mockSignIn.mockResolvedValue({ type: 'cancelled' });
  mockIsSuccessResponse.mockReturnValue(false);
  await expect(signInWithGoogle()).resolves.toBeNull();
  expect(mockSignInWithIdToken).not.toHaveBeenCalled();
});

test('signInWithGoogle throws when the token exchange errors', async () => {
  mockSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'idtok' } });
  mockIsSuccessResponse.mockReturnValue(true);
  mockSignInWithIdToken.mockResolvedValue({ data: { session: null }, error: { message: 'bad token' } });
  await expect(signInWithGoogle()).rejects.toThrow('bad token');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @autodidact/mobile test social-auth.google`
Expected: FAIL — `../social-auth` has no exports.

- [ ] **Step 3: Implement the Google half of the seam**

Create `apps/mobile/src/lib/social-auth.ts`:

```ts
import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;

export interface SocialSession {
  accessToken: string;
  refreshToken: string;
}

/** Call once at app startup (app/_layout.tsx), before any sign-in. */
export function configureGoogleSignin(): void {
  GoogleSignin.configure({ webClientId: extra?.['googleWebClientId'] ?? '' });
}

/** Native Google sign-in. Returns null if the user cancels; throws on failure. */
export async function signInWithGoogle(): Promise<SocialSession | null> {
  await GoogleSignin.hasPlayServices(); // Android guard — clean error on no-Play-Services
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null; // cancelled / dismissed
  const idToken = response.data.idToken;
  if (!idToken) throw new Error('Google sign-in returned no ID token');
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw new Error(error.message);
  const session = data.session;
  if (!session?.access_token || !session?.refresh_token) throw new Error('No session from Google sign-in');
  return { accessToken: session.access_token, refreshToken: session.refresh_token };
}
```

> **Version note (verify against the installed SDK):** the v13+ `@react-native-google-signin` API returns `{ type, data: { idToken } }` and ships `isSuccessResponse`. If `pnpm` resolved an older major, adapt the response destructuring (older returns `{ idToken }` directly) — the *test mock* encodes the expected shape, so keep mock and impl in lockstep.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @autodidact/mobile test social-auth.google`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/social-auth.ts apps/mobile/src/lib/__tests__/social-auth.google.test.ts
git commit -m "feat(mobile): social-auth seam — configureGoogleSignin + native signInWithGoogle"
```

---

### Task 4: Seam — `signInWithFacebook()` (web PKCE)

**Files:**
- Modify: `apps/mobile/src/lib/social-auth.ts`
- Test: `apps/mobile/src/lib/__tests__/social-auth.facebook.test.ts` (create)

**Interfaces:**
- Produces: `signInWithFacebook(): Promise<SocialSession | null>` — `null` = user cancelled; throws on failure.
- Consumes: `@/lib/supabase` (`signInWithOAuth`, `exchangeCodeForSession`), `expo-web-browser` (`openAuthSessionAsync`), `expo-linking` (`createURL`, `parse`).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/lib/__tests__/social-auth.facebook.test.ts`:

```ts
const mockSignInWithOAuth = jest.fn();
const mockExchangeCodeForSession = jest.fn();
const mockOpenAuthSessionAsync = jest.fn();
const mockCreateURL = jest.fn(() => 'autodidact://auth-callback');
const mockParse = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...a: unknown[]) => mockSignInWithOAuth(...a),
      exchangeCodeForSession: (...a: unknown[]) => mockExchangeCodeForSession(...a),
    },
  },
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...a: unknown[]) => mockOpenAuthSessionAsync(...a),
}));
jest.mock('expo-linking', () => ({
  createURL: (...a: unknown[]) => mockCreateURL(...a),
  parse: (...a: unknown[]) => mockParse(...a),
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }));

import { signInWithFacebook } from '../social-auth';

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateURL.mockReturnValue('autodidact://auth-callback');
});

test('signInWithFacebook opens the browser, exchanges the code from result.url, returns the session', async () => {
  mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://fb/oauth?x=1' }, error: null });
  mockOpenAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'autodidact://auth-callback?code=abc' });
  mockParse.mockReturnValue({ queryParams: { code: 'abc' } });
  mockExchangeCodeForSession.mockResolvedValue({
    data: { session: { access_token: 'at', refresh_token: 'rt' } },
    error: null,
  });

  const result = await signInWithFacebook();

  expect(mockSignInWithOAuth).toHaveBeenCalledWith({
    provider: 'facebook',
    options: { redirectTo: 'autodidact://auth-callback', skipBrowserRedirect: true },
  });
  expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith('https://fb/oauth?x=1', 'autodidact://auth-callback');
  expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc');
  expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
});

test('signInWithFacebook returns null when the user dismisses the browser', async () => {
  mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://fb/oauth' }, error: null });
  mockOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
  await expect(signInWithFacebook()).resolves.toBeNull();
  expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
});

test('signInWithFacebook throws when signInWithOAuth errors', async () => {
  mockSignInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: 'oauth init failed' } });
  await expect(signInWithFacebook()).rejects.toThrow('oauth init failed');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @autodidact/mobile test social-auth.facebook`
Expected: FAIL — `signInWithFacebook` is not exported.

- [ ] **Step 3: Implement the Facebook half of the seam**

Append to `apps/mobile/src/lib/social-auth.ts` (add the two imports at the top):

```ts
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
```

```ts
/** Facebook web OAuth (PKCE). Returns null if the user dismisses; throws on failure. */
export async function signInWithFacebook(): Promise<SocialSession | null> {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error('Facebook sign-in returned no authorization URL');

  // openAuthSessionAsync RETURNS the redirect to its caller (result.url on success).
  // Do NOT use Linking.addEventListener / getInitialURL — no global listener is involved.
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null; // cancel / dismiss

  const code = Linking.parse(result.url).queryParams?.code;
  if (typeof code !== 'string') throw new Error('Facebook callback returned no code');

  const { data: sess, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr) throw new Error(exErr.message);
  const session = sess.session;
  if (!session?.access_token || !session?.refresh_token) throw new Error('No session from Facebook sign-in');
  return { accessToken: session.access_token, refreshToken: session.refresh_token };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @autodidact/mobile test social-auth`
Expected: PASS (Google + Facebook suites green).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/social-auth.ts apps/mobile/src/lib/__tests__/social-auth.facebook.test.ts
git commit -m "feat(mobile): social-auth seam — web-PKCE signInWithFacebook (openAuthSessionAsync)"
```

---

### Task 5: Startup wiring — call `configureGoogleSignin()` in `app/_layout.tsx`

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`
- Test: `apps/mobile/app/__tests__/root-layout.configure.test.tsx` (create)

**Interfaces:**
- Consumes: `configureGoogleSignin` (Task 3).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/__tests__/root-layout.configure.test.tsx`:

```tsx
const mockConfigureGoogleSignin = jest.fn();
jest.mock('@/lib/social-auth', () => ({ configureGoogleSignin: () => mockConfigureGoogleSignin() }));
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { setSession: jest.fn(), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }) } },
}));
jest.mock('expo-router', () => ({
  Slot: () => null,
  useRouter: () => ({ replace: jest.fn() }),
  useSegments: () => [],
}));

import { renderWithProviders } from '@/test-utils/render';
import RootLayout from '../_layout';

test('configures Google Sign-In once at startup', () => {
  renderWithProviders(<RootLayout />);
  expect(mockConfigureGoogleSignin).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @autodidact/mobile test root-layout.configure`
Expected: FAIL — `configureGoogleSignin` is never called.

- [ ] **Step 3: Implement — call it once on mount**

In `apps/mobile/app/_layout.tsx`, add the import and a one-time effect (place the effect next to the existing session-restore effect):

```tsx
import { configureGoogleSignin } from '@/lib/social-auth';
```

```tsx
  // Configure the native Google Sign-In SDK once at startup (before any sign-in).
  useEffect(() => {
    configureGoogleSignin();
  }, []);
```

- [ ] **Step 4: Run the test + full suite**

Run: `pnpm --filter @autodidact/mobile test root-layout.configure`
Expected: PASS.
Run: `pnpm --filter @autodidact/mobile test` — no regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/_layout.tsx apps/mobile/app/__tests__/root-layout.configure.test.tsx
git commit -m "feat(mobile): configure Google Sign-In at app startup"
```

---

### Task 6: Sign-in screen — Google/Facebook buttons, email demoted, guest kept

**Files:**
- Modify: `apps/mobile/app/(auth)/sign-in.tsx`
- Test: `apps/mobile/app/(auth)/__tests__/sign-in.test.tsx` (extend)

**Interfaces:**
- Consumes: `signInWithGoogle`, `signInWithFacebook` (Tasks 3/4); `useAuthStore().setSession` (`(at, rt, isAnonymous=false)`).

- [ ] **Step 1: Write the failing tests (extend the existing file)**

Add to `apps/mobile/app/(auth)/__tests__/sign-in.test.tsx` — mock the seam and assert the buttons drive it (mirror the existing `mock`-prefixed pattern):

```tsx
const mockSignInWithGoogle = jest.fn();
const mockSignInWithFacebook = jest.fn();
jest.mock('@/lib/social-auth', () => ({
  signInWithGoogle: (...a: unknown[]) => mockSignInWithGoogle(...a),
  signInWithFacebook: (...a: unknown[]) => mockSignInWithFacebook(...a),
}));

// ... existing supabase + expo-router mocks stay ...

test('Continue with Google signs in and records a non-anonymous session', async () => {
  mockSignInWithGoogle.mockResolvedValue({ accessToken: 'gat', refreshToken: 'grt' });
  const { getByText } = renderWithProviders(<SignInScreen />);
  fireEvent.press(getByText('Continue with Google'));
  await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('gat'));
  expect(useAuthStore.getState().isAnonymous).toBe(false);
});

test('Continue with Facebook signs in', async () => {
  mockSignInWithFacebook.mockResolvedValue({ accessToken: 'fat', refreshToken: 'frt' });
  const { getByText } = renderWithProviders(<SignInScreen />);
  fireEvent.press(getByText('Continue with Facebook'));
  await waitFor(() => expect(mockSignInWithFacebook).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('fat'));
});

test('a cancelled Google sign-in (null) does not set a session and does not crash', async () => {
  mockSignInWithGoogle.mockResolvedValue(null);
  const { getByText } = renderWithProviders(<SignInScreen />);
  fireEvent.press(getByText('Continue with Google'));
  await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalled());
  expect(useAuthStore.getState().accessToken).toBeNull();
});

test('email/password is hidden until "Use email instead" is pressed', () => {
  const { queryByLabelText, getByText } = renderWithProviders(<SignInScreen />);
  expect(queryByLabelText('Email')).toBeNull();
  fireEvent.press(getByText('Use email instead'));
  expect(queryByLabelText('Email')).not.toBeNull();
});
```

> Add `mockSignInWithGoogle.mockReset(); mockSignInWithFacebook.mockReset();` to the existing `beforeEach`. Confirm the `Input` component forwards `label` as an accessibility label; if it doesn't, assert on the placeholder text (`getByPlaceholderText('you@example.com')`) instead.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @autodidact/mobile test sign-in`
Expected: FAIL — no "Continue with Google" button; email always visible.

- [ ] **Step 3: Implement the screen**

Replace `apps/mobile/app/(auth)/sign-in.tsx` with (Google + Facebook headline; email/password behind a toggle; guest kept):

```tsx
import { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { YStack } from 'tamagui';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle, signInWithFacebook } from '@/lib/social-auth';
import { Screen, Heading, AppText, Input, Button } from '@/components';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);

  const runSocial = async (
    fn: () => Promise<{ accessToken: string; refreshToken: string } | null>,
    setBusy: (b: boolean) => void,
    failTitle: string,
  ) => {
    setBusy(true);
    try {
      const session = await fn();
      if (session) setSession(session.accessToken, session.refreshToken, false);
    } catch (e) {
      Alert.alert(failTitle, e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Sign in failed', error.message);
      return;
    }
    if (data.session?.access_token && data.session?.refresh_token) {
      setSession(data.session.access_token, data.session.refresh_token);
    }
  };

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

  return (
    <Screen>
      <YStack flex={1} justifyContent="center" gap="$4">
        <YStack gap="$2" marginBottom="$6">
          <Heading size="h1">Autodidact</Heading>
          <AppText variant="muted" size="lg">Learn anything, one module at a time.</AppText>
        </YStack>

        <Button variant="primary" size="lg" loading={googleLoading}
          onPress={() => runSocial(signInWithGoogle, setGoogleLoading, 'Google sign-in failed')}>
          Continue with Google
        </Button>
        <Button variant="primary" size="lg" loading={facebookLoading}
          onPress={() => runSocial(signInWithFacebook, setFacebookLoading, 'Facebook sign-in failed')}>
          Continue with Facebook
        </Button>

        {showEmail ? (
          <YStack gap="$3">
            <Input label="Email" placeholder="you@example.com" value={email}
              onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Input label="Password" placeholder="Password" value={password}
              onChangeText={setPassword} secureTextEntry />
            <Button variant="secondary" size="lg" loading={loading} onPress={handleSignIn}>
              Sign In
            </Button>
            <Button variant="ghost" size="sm" onPress={() => router.push('/(auth)/sign-up')}>
              Don't have an account? Sign up
            </Button>
          </YStack>
        ) : (
          <Button variant="ghost" size="sm" onPress={() => setShowEmail(true)}>
            Use email instead
          </Button>
        )}

        <Button variant="ghost" size="sm" loading={guestLoading} onPress={handleGuest}>
          Continue as guest
        </Button>
      </YStack>
    </Screen>
  );
}
```

> If `Button` has no `secondary` variant, use `primary`. Check `@/components` Button variants before relying on `secondary`.

- [ ] **Step 4: Run the tests + full suite**

Run: `pnpm --filter @autodidact/mobile test sign-in`
Expected: PASS (existing guest/email tests + new Google/Facebook/toggle tests).
Run: `pnpm --filter @autodidact/mobile test && pnpm --filter @autodidact/mobile typecheck`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/app/(auth)/sign-in.tsx" "apps/mobile/app/(auth)/__tests__/sign-in.test.tsx"
git commit -m "feat(mobile): Google/Facebook headline sign-in; email demoted; guest kept"
```

---

### Task 7: Setup docs + dev-build runbook

**Files:**
- Modify: `apps/mobile/README.md` (or create `apps/mobile/docs/social-sign-in.md` and link it)
- Modify: `apps/mobile/CLAUDE.md` (one line under the Auth invariants pointing to the seam + dev-build requirement)

- [ ] **Step 1: Write the setup runbook**

Document, concretely:
- **Supabase dashboard** → Authentication → Providers: enable **Google** (paste the Web client ID + secret) and **Facebook** (App ID + secret). Add `autodidact://auth-callback` to the **Redirect URLs** allow-list.
- **Google Cloud Console** — create OAuth client IDs: one **Web** client (used as `GOOGLE_WEB_CLIENT_ID` + in Supabase), and **TWO Android** client IDs (D6a) — one bound to the **EAS dev-build** signing SHA-1, one to the **production** key SHA-1. Get both SHA-1s via `cd apps/mobile && eas credentials` (Android → keystore). Document explicitly that **forgetting the second (prod) Android client ID is the usual cause of "Google works in dev, fails in prod."**
- **Facebook** — create an app, add the Android platform + key hashes, set the OAuth redirect to the Supabase callback.
- **Env** — set `GOOGLE_WEB_CLIENT_ID` and `FACEBOOK_ENABLED=true` in `.env.dev` (and EAS env per profile).
- **Dev build (required — native Google can't run in Expo Go):**
  ```bash
  cd apps/mobile
  eas build --profile development --platform android   # cloud build (avoids WSL2 toolchain)
  # install the resulting APK on the emulator, then run Metro as usual:
  pnpm --filter @autodidact/mobile start
  ```
  Day-to-day JS iteration stays on fast-refresh; rebuild only when native deps change.

- [ ] **Step 2: Add the CLAUDE.md pointer**

Under `apps/mobile/CLAUDE.md` → Auth invariants, add one line: social sign-in goes through `src/lib/social-auth.ts` (Google native via `signInWithIdToken`, Facebook web-PKCE via `openAuthSessionAsync`); the app must run on a **custom dev build** (not Expo Go); guest→OAuth upgrade is Phase 2.

- [ ] **Step 3: Verify + commit**

Run: `grep -rn "social-auth\|dev build" apps/mobile/CLAUDE.md apps/mobile/README.md`
Expected: the pointer + runbook present.

```bash
git add apps/mobile/README.md apps/mobile/CLAUDE.md apps/mobile/docs/social-sign-in.md
git commit -m "docs(mobile): social sign-in setup runbook (providers, dual Android client IDs, dev build)"
```

---

## Verification (end-to-end, Phase 1)

```bash
pnpm --filter @autodidact/mobile test       # seam (google+facebook), supabase adapter, layout, sign-in screen — all green
pnpm --filter @autodidact/mobile typecheck  # clean
# Manual on the dev build (native sheets can't run in CI):
#  - Continue with Google → native sheet → lands in (app); a public.users row exists (trigger).
#  - Continue with Facebook → in-app browser → autodidact://auth-callback → lands in (app).
#  - "Use email instead" reveals email/password; existing sign-in still works.
#  - "Continue as guest" still works.
#  - Cancelling either social flow returns to the sign-in screen (no crash).
```

**Done when:** Google (native) and Facebook (web-PKCE) sign-in work on the dev build via the `social-auth.ts` seam; email/password (behind "use email instead") and guest are retained; the PKCE storage adapter is in place; all Jest suites + typecheck pass; the setup runbook (incl. the dual Android client IDs) is documented. Backend untouched.

## Self-review notes (spec coverage)

- **D1 hybrid seam** → Tasks 3 (Google native) + 4 (Facebook web-PKCE), one `social-auth.ts`. **D3 PKCE+adapter** → Task 2. **D6/D6a config** → Tasks 1 + 7 (dual Android client IDs called out). **`configure()` at startup** → Task 5. **FB code from `result.url`, not Linking** → encoded in Task 4 impl + test. **`hasPlayServices` guard** → Task 3. **Keep email/guest** → Task 6. **D4 backend unchanged / D5 linkIdentity deferred** → no tasks (correct).
- **No placeholders**; types consistent (`SocialSession { accessToken, refreshToken }` used in Tasks 3/4/6; `setSession(at, rt, isAnonymous=false)` matches the store).
- **Version-sensitive surfaces flagged** (Google SDK response shape; `Button`/`Input` variant + label assumptions) with a concrete fallback each — the mocked tests pin the contract; manual dev-build verification catches real-SDK drift.
