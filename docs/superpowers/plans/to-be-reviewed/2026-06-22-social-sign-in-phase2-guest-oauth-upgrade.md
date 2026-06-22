# Social Sign-In Phase 2 (Guest → OAuth Upgrade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let an anonymous guest upgrade to a permanent account by linking a Google or Facebook identity (`linkIdentity`), preserving their UUID + progress, with `public.users` guaranteed in sync via a defensive trigger.

**Architecture:** `linkIdentity` is a web-OAuth flow (returns a URL) for BOTH providers — no native-SDK linking — so it reuses Phase 1's web-browser pattern (`openAuthSessionAsync` → `exchangeCodeForSession`). Two new seam functions `linkWithGoogle()`/`linkWithFacebook()` sit beside Phase 1's sign-in functions and share an extracted `exchangeViaWebBrowser()` helper. `UpgradeAccountCard` gains Google/Facebook buttons (anon-only). A defensive `AFTER INSERT ON auth.identities` trigger (migration `0011`) syncs `public.users` regardless of whether GoTrue updates `auth.users` columns on link.

**Tech Stack:** `@supabase/supabase-js` (`linkIdentity`, `exchangeCodeForSession`), `expo-web-browser`, `expo-linking` (Phase 1 deps); Drizzle hand-authored SQL migration; Jest (jest-expo) + `@testing-library/react-native`; `@autodidact/test-support` (Testcontainers) for the trigger test.

**Source spec:** `docs/superpowers/specs/to-be-reviewed/2026-06-22-social-sign-in-design.md` (Phase 2 / D5). Builds on Phase 1 (the `social-auth.ts` seam, already on master) and Spec 2 (provisioning triggers, `sync_user_from_auth`).

## Global Constraints

- **`linkIdentity` requires GoTrue "manual linking" enabled.** `supabase/config.toml` currently has `enable_manual_linking = false` — Task 2 flips it to `true` (local); Task 5 enables it in the prod dashboard. Without it, every link call fails.
- **`linkIdentity` is web-OAuth for both providers** (no native id-token linking). Both upgrades use `openAuthSessionAsync`; do NOT use `Linking.addEventListener`/`getInitialURL`. PKCE relies on the SecureStore adapter (Phase 1, already in place).
- **Identity contract / provisioning split (ADR-028):** sync lives in DB triggers, not app logic. The new trigger is `SECURITY DEFINER` + `SET search_path=''` + schema-qualified + `REVOKE EXECUTE` from `anon`/`authenticated` (mirror `0007`/`0008`).
- **Drizzle is the sole migration authority**; hand-authored SQL in `packages/db/migrations/`, registered in `meta/_journal.json`, **no** snapshot file (`db:generate` is broken). Next number is **`0011`**.
- **Reconcile guest status from the SERVER-returned `data.user.is_anonymous`, never optimistically** (email-confirmation may keep a linked user anonymous until confirmed) — same rule the email upgrade already follows.
- **Prod apply is owner-gated** (Task 5): `pnpm migrate:prod` (loads `infra/secrets.env`; `.env.prod` is retired) or the Supabase MCP fallback + journal hand-sync. Enable manual linking in the prod dashboard.
- Testing = Jest (mock-at-seam, `mock`-prefixed); backend trigger via `@autodidact/test-support`. `pnpm --filter <pkg> test|typecheck`.

---

### Task 1: Migration `0011` — defensive identity-link sync trigger + harness stub + test

**Files:**
- Create: `packages/db/migrations/0011_identity_link_sync.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Modify: `packages/test-support/src/database.ts` (add an `auth.identities` stub to `DEV_DB_INIT_SQL`)
- Test: `packages/test-support/src/__tests__/identity-link-sync.integration.test.ts`

**Interfaces:**
- Produces: `public.handle_identity_linked()` + trigger `on_auth_identity_linked AFTER INSERT ON auth.identities`.

- [ ] **Step 1: Author the migration**

Create `packages/db/migrations/0011_identity_link_sync.sql`:

```sql
-- 0011_identity_link_sync.sql
-- Social sign-in Phase 2 (Spec 2 / D5) — defensive sync when an identity is LINKED.
-- The column-scoped sync_user_from_auth trigger (0007) fires only on UPDATE OF email,is_anonymous
-- on auth.users. If linkIdentity (guest links Google/Facebook) writes auth.identities WITHOUT
-- touching those auth.users columns, public.users would go stale. This idempotent AFTER INSERT
-- trigger on auth.identities closes that gap (belt-and-suspenders with 0007; harmless if redundant).
CREATE OR REPLACE FUNCTION public.handle_identity_linked()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    UPDATE public.users
       SET email        = COALESCE(NEW.identity_data ->> 'email', public.users.email),
           is_anonymous = false,
           updated_at   = now()
     WHERE id = NEW.user_id;
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS on_auth_identity_linked ON auth.identities;
CREATE TRIGGER on_auth_identity_linked
  AFTER INSERT ON auth.identities
  FOR EACH ROW EXECUTE FUNCTION public.handle_identity_linked();

-- Defense-in-depth (mirrors 0008): the SECURITY DEFINER fn must not be RPC-callable by clients.
REVOKE EXECUTE ON FUNCTION public.handle_identity_linked() FROM PUBLIC, anon, authenticated;
```

> Rationale for `is_anonymous = false` on any identity insert: an anonymous user has NO identity row; an identity is inserted only at real signup or on link — so its presence means the user is non-anonymous. For a normal email signup this runs alongside `handle_new_user` and is redundant-but-correct.

- [ ] **Step 2: Register in the journal**

Append to `packages/db/migrations/meta/_journal.json` (after the highest existing `idx`; use a `when` strictly greater than the previous entry — confirm the current tail and increment, e.g. `1782400000000`):

```json
{ "idx": <next>, "version": "7", "when": 1782400000000, "tag": "0011_identity_link_sync", "breakpoints": true }
```

- [ ] **Step 3: Add the `auth.identities` stub to the test harness**

In `packages/test-support/src/database.ts`, inside `DEV_DB_INIT_SQL`, after the `auth.users` stub, add a minimal `auth.identities` stub so the trigger installs and is testable (the real table is GoTrue-managed in the stack/prod):

```sql
CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  identity_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text NOT NULL DEFAULT 'email'
);
```

Update `packages/test-support/CLAUDE.md`'s stub description to mention `auth.identities` (one line).

- [ ] **Step 4: Write the failing integration test**

Create `packages/test-support/src/__tests__/identity-link-sync.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { withTestDatabase, type TestDatabase } from '../database.js';

describe('handle_identity_linked trigger (Phase 2 guest→OAuth upgrade)', () => {
  let h: TestDatabase;
  beforeAll(async () => { h = await withTestDatabase(); }, 90_000);
  afterAll(async () => { await h.close(); });
  beforeEach(async () => { await h.truncate(); await h.pool.query('delete from auth.users; delete from auth.identities'); });

  it('syncs public.users when an identity is linked to an anonymous user', async () => {
    // anonymous user provisioned by handle_new_user (email NULL, is_anonymous true)
    const { rows } = await h.pool.query(
      `insert into auth.users (email, is_anonymous) values (NULL, true) returning id`,
    );
    const id = rows[0].id as string;
    const before = await h.pool.query(`select email, is_anonymous from public.users where id=$1`, [id]);
    expect(before.rows[0].is_anonymous).toBe(true);

    // simulate linkIdentity's DB effect: a new auth.identities row carrying the email
    await h.pool.query(
      `insert into auth.identities (user_id, identity_data, provider) values ($1, $2::jsonb, 'google')`,
      [id, JSON.stringify({ email: 'linked@test.dev' })],
    );

    const after = await h.pool.query(`select email, is_anonymous from public.users where id=$1`, [id]);
    expect(after.rows[0].email).toBe('linked@test.dev');
    expect(after.rows[0].is_anonymous).toBe(false);
  });

  it('preserves existing email when the linked identity has none', async () => {
    const { rows } = await h.pool.query(
      `insert into auth.users (email, is_anonymous) values ('real@test.dev', false) returning id`,
    );
    const id = rows[0].id as string;
    await h.pool.query(
      `insert into auth.identities (user_id, identity_data, provider) values ($1, '{}'::jsonb, 'google')`,
      [id],
    );
    const after = await h.pool.query(`select email, is_anonymous from public.users where id=$1`, [id]);
    expect(after.rows[0].email).toBe('real@test.dev');
    expect(after.rows[0].is_anonymous).toBe(false);
  });
});
```

- [ ] **Step 5: Run → fail, then it passes after the migration applies in the harness**

Run: `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/test-support test identity-link-sync`
Expected: FAILS first only if the stub/migration aren't in place; once Steps 1–3 are committed the harness applies `0011` and the 2 tests PASS. Also run the full `@autodidact/test-support` suite to confirm the new `auth.identities` stub didn't break existing harness tests.

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/0011_identity_link_sync.sql packages/db/migrations/meta/_journal.json \
        packages/test-support/src/database.ts packages/test-support/CLAUDE.md \
        packages/test-support/src/__tests__/identity-link-sync.integration.test.ts
git commit -m "feat(db): defensive identity-link sync trigger (0011) + harness stub (Spec 2 social Phase 2)"
```

---

### Task 2: Seam — `linkWithGoogle()` / `linkWithFacebook()` + shared helper + manual-linking config

**Files:**
- Modify: `apps/mobile/src/lib/social-auth.ts`
- Modify: `apps/mobile/src/lib/__tests__/social-auth.facebook.test.ts` (or a new `social-auth.link.test.ts`)
- Modify: `supabase/config.toml` (`enable_manual_linking = true`)

**Interfaces:**
- Consumes: existing `SocialSession`, `supabase`, `WebBrowser`, `Linking` (Phase 1).
- Produces: `linkWithGoogle(): Promise<SocialSession | null>`, `linkWithFacebook(): Promise<SocialSession | null>` (null = user dismissed; throws on failure), and a private `exchangeViaWebBrowser(authUrl, redirectTo)`.

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/lib/__tests__/social-auth.link.test.ts` (mirror the Phase 1 FB test mocks; add `mockLinkIdentity`):

```ts
const mockLinkIdentity = jest.fn();
const mockExchangeCodeForSession = jest.fn();
const mockOpenAuthSessionAsync = jest.fn();
const mockCreateURL = jest.fn(() => 'autodidact://auth-callback');
const mockParse = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: {
    linkIdentity: (...a: unknown[]) => mockLinkIdentity(...a),
    exchangeCodeForSession: (...a: unknown[]) => mockExchangeCodeForSession(...a),
  } },
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: (...a: unknown[]) => mockOpenAuthSessionAsync(...a) }));
jest.mock('expo-linking', () => ({ createURL: (...a: unknown[]) => mockCreateURL(...a), parse: (...a: unknown[]) => mockParse(...a) }));
jest.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: {}, isSuccessResponse: jest.fn() }));
jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }));

import { linkWithGoogle, linkWithFacebook } from '../social-auth';

beforeEach(() => { jest.clearAllMocks(); mockCreateURL.mockReturnValue('autodidact://auth-callback'); });

test('linkWithGoogle runs linkIdentity then exchanges the code from result.url', async () => {
  mockLinkIdentity.mockResolvedValue({ data: { url: 'https://supabase/oauth?p=google' }, error: null });
  mockOpenAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'autodidact://auth-callback?code=abc' });
  mockParse.mockReturnValue({ queryParams: { code: 'abc' } });
  mockExchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null });

  const result = await linkWithGoogle();
  expect(mockLinkIdentity).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'autodidact://auth-callback', skipBrowserRedirect: true } });
  expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc');
  expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
});

test('linkWithFacebook calls linkIdentity with the facebook provider', async () => {
  mockLinkIdentity.mockResolvedValue({ data: { url: 'https://supabase/oauth?p=fb' }, error: null });
  mockOpenAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'autodidact://auth-callback?code=xyz' });
  mockParse.mockReturnValue({ queryParams: { code: 'xyz' } });
  mockExchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: 'a2', refresh_token: 'r2' } }, error: null });
  const result = await linkWithFacebook();
  expect(mockLinkIdentity).toHaveBeenCalledWith({ provider: 'facebook', options: { redirectTo: 'autodidact://auth-callback', skipBrowserRedirect: true } });
  expect(result).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
});

test('linkWithGoogle returns null when the user dismisses', async () => {
  mockLinkIdentity.mockResolvedValue({ data: { url: 'https://supabase/oauth' }, error: null });
  mockOpenAuthSessionAsync.mockResolvedValue({ type: 'dismiss' });
  await expect(linkWithGoogle()).resolves.toBeNull();
  expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
});

test('linkWithGoogle throws when linkIdentity errors', async () => {
  mockLinkIdentity.mockResolvedValue({ data: { url: null }, error: { message: 'manual linking disabled' } });
  await expect(linkWithGoogle()).rejects.toThrow('manual linking disabled');
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @autodidact/mobile test social-auth.link`
Expected: FAIL — `linkWithGoogle`/`linkWithFacebook` not exported.

- [ ] **Step 3: Implement — extract the shared helper + add the two link functions**

In `apps/mobile/src/lib/social-auth.ts`, extract the browser+exchange logic (currently inline in `signInWithFacebook`) into a private helper and reuse it (DRY — `signInWithFacebook` calls it too):

```ts
// Shared: complete a web OAuth/link flow opened in the in-app browser. The redirect
// (with ?code=) is RETURNED as result.url on success — NOT delivered via a Linking listener.
async function exchangeViaWebBrowser(authUrl: string, redirectTo: string): Promise<SocialSession | null> {
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
  if (result.type !== 'success') return null; // cancel / dismiss
  const code = Linking.parse(result.url).queryParams?.code;
  if (typeof code !== 'string') throw new Error('OAuth callback returned no code');
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw new Error(error.message);
  const session = data.session;
  if (!session?.access_token || !session?.refresh_token) throw new Error('No session from OAuth flow');
  return { accessToken: session.access_token, refreshToken: session.refresh_token };
}

export async function linkWithGoogle(): Promise<SocialSession | null> {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error('Google link returned no authorization URL');
  return exchangeViaWebBrowser(data.url, redirectTo);
}

export async function linkWithFacebook(): Promise<SocialSession | null> {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'facebook',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error('Facebook link returned no authorization URL');
  return exchangeViaWebBrowser(data.url, redirectTo);
}
```

Refactor the existing `signInWithFacebook` to `return exchangeViaWebBrowser(data.url, redirectTo);` after its `signInWithOAuth` call (replacing the now-duplicated inline browser+exchange block). Re-run `social-auth.facebook` tests to confirm no regression.

- [ ] **Step 4: Enable manual linking locally**

In `supabase/config.toml`, set `enable_manual_linking = true` (it is currently `false`). Validate the config parses: `pnpm exec supabase status` (rc 0, no config error). (Takes effect on the next stack restart — `pnpm dev` / `db:reset:dev`.)

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @autodidact/mobile test social-auth` (link + facebook + google all green) and `pnpm --filter @autodidact/mobile typecheck`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/social-auth.ts apps/mobile/src/lib/__tests__/social-auth.link.test.ts supabase/config.toml
git commit -m "feat(mobile,auth): linkWithGoogle/linkWithFacebook (web linkIdentity) + manual-linking config (Spec 2 Phase 2)"
```

---

### Task 3: `UpgradeAccountCard` — Google/Facebook upgrade buttons

**Files:**
- Modify: `apps/mobile/src/components/auth/UpgradeAccountCard.tsx`
- Test: `apps/mobile/src/components/auth/__tests__/UpgradeAccountCard.test.tsx` (create if absent; check the dir first and mirror the sign-in test pattern)

**Interfaces:**
- Consumes: `linkWithGoogle`/`linkWithFacebook` (Task 2); existing `useAuthStore` (`setSession`, `accessToken`, `refreshToken`, `isAnonymous`).

- [ ] **Step 1: Write the failing tests**

Mirror the sign-in test mock style. Mock `@/lib/social-auth` and `@/lib/supabase`; render with `renderWithProviders`; seed an anonymous session via `useAuthStore.getState().setSession('at','rt',true)`:

```tsx
const mockLinkWithGoogle = jest.fn();
const mockLinkWithFacebook = jest.fn();
jest.mock('@/lib/social-auth', () => ({
  linkWithGoogle: (...a: unknown[]) => mockLinkWithGoogle(...a),
  linkWithFacebook: (...a: unknown[]) => mockLinkWithFacebook(...a),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { updateUser: jest.fn() } } }));

import { renderWithProviders } from '@/test-utils/render';
import { useAuthStore } from '@/stores/auth.store';
import { UpgradeAccountCard } from '../UpgradeAccountCard';
import { fireEvent, waitFor } from '@testing-library/react-native';

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.getState().setSession('at', 'rt', true); // anonymous guest
});

test('shows Google/Facebook upgrade buttons for an anonymous user', () => {
  const { getByText } = renderWithProviders(<UpgradeAccountCard />);
  expect(getByText('Continue with Google')).toBeTruthy();
  expect(getByText('Continue with Facebook')).toBeTruthy();
});

test('Continue with Google links the identity and records the session', async () => {
  mockLinkWithGoogle.mockResolvedValue({ accessToken: 'nat', refreshToken: 'nrt' });
  const { getByText } = renderWithProviders(<UpgradeAccountCard />);
  fireEvent.press(getByText('Continue with Google'));
  await waitFor(() => expect(mockLinkWithGoogle).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('nat'));
});

test('renders nothing for a non-anonymous user', () => {
  useAuthStore.getState().setSession('at', 'rt', false);
  const { queryByText } = renderWithProviders(<UpgradeAccountCard />);
  expect(queryByText('Continue with Google')).toBeNull();
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @autodidact/mobile test UpgradeAccountCard`
Expected: FAIL — no Google/Facebook buttons.

- [ ] **Step 3: Implement**

Add a shared social-link runner + two buttons to `UpgradeAccountCard.tsx` (keep the existing email/password upgrade). After a successful link, reconcile from the store/session like the social sign-in does — `linkWith*` returns the post-link session tokens, set them with `isAnonymous=false`:

```tsx
import { linkWithGoogle, linkWithFacebook } from '@/lib/social-auth';
```

```tsx
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);

  const runLink = async (
    fn: () => Promise<{ accessToken: string; refreshToken: string } | null>,
    setBusy: (b: boolean) => void,
    failTitle: string,
  ) => {
    setBusy(true);
    try {
      const session = await fn();
      if (session) {
        setSession(session.accessToken, session.refreshToken, false);
        Alert.alert('Account saved', 'Your progress is now linked to your account.');
      }
    } catch (e) {
      Alert.alert(failTitle, e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };
```

Render the two buttons (above the email/password fields) inside the card's `YStack`:

```tsx
        <Button variant="primary" size="lg" loading={googleLoading}
          onPress={() => runLink(linkWithGoogle, setGoogleLoading, 'Google link failed')}>
          Continue with Google
        </Button>
        <Button variant="primary" size="lg" loading={facebookLoading}
          onPress={() => runLink(linkWithFacebook, setFacebookLoading, 'Facebook link failed')}>
          Continue with Facebook
        </Button>
```

- [ ] **Step 4: Run tests + full suite + typecheck**

Run: `pnpm --filter @autodidact/mobile test UpgradeAccountCard`, then `pnpm --filter @autodidact/mobile test` (no regressions) + `pnpm --filter @autodidact/mobile typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/auth/UpgradeAccountCard.tsx apps/mobile/src/components/auth/__tests__/UpgradeAccountCard.test.tsx
git commit -m "feat(mobile): guest→OAuth upgrade buttons (Google/Facebook linkIdentity) on UpgradeAccountCard (Spec 2 Phase 2)"
```

---

### Task 4: Docs

**Files:**
- Modify: `apps/mobile/docs/social-sign-in.md` (add the Phase 2 / manual-linking section)
- Modify: `apps/mobile/CLAUDE.md` (update the social-sign-in Auth line: Phase 2 shipped)

- [ ] **Step 1: Document**
- In the runbook: a "Phase 2 — guest → OAuth upgrade" section: enable **manual linking** in the Supabase dashboard (Auth → settings) + `config.toml` `enable_manual_linking = true`; that `UpgradeAccountCard` offers Google/Facebook link; that the `0011` trigger guarantees `public.users` sync; and the prod-apply note (Task 5).
- In `apps/mobile/CLAUDE.md`, update the social-sign-in Auth invariant line: guest→OAuth upgrade is **live** via `linkWithGoogle`/`linkWithFacebook` (web `linkIdentity`); requires manual linking enabled; the `0011` identity-link trigger keeps `public.users` synced.

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/docs/social-sign-in.md apps/mobile/CLAUDE.md
git commit -m "docs(mobile): Phase 2 guest→OAuth upgrade + manual-linking setup (Spec 2)"
```

---

### Task 5: Apply `0011` + enable manual linking (local + prod, owner-gated)

**Files:** none (operational).

- [ ] **Step 1: Apply `0011` locally + verify**

Run: `env DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres pnpm --filter @autodidact/db db:migrate`. Verify the trigger exists:
```bash
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -tAc "select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and tgname='on_auth_identity_linked';"
```
Expected: `on_auth_identity_linked`.

- [ ] **Step 2: Real-GoTrue end-to-end verification (local stack)**

With `enable_manual_linking = true` + Google/FB providers configured locally, drive a guest→link flow on the dev build (or via the Supabase JS console): `signInAnonymously()` → `linkIdentity({provider})` → confirm `public.users` row for the same `id` now has `is_anonymous=false` and the email populated. This confirms the trigger fires for the REAL `auth.identities` shape (the harness stub can't prove GoTrue's column names — this step does).

- [ ] **Step 3: Apply `0011` to prod + enable manual linking**

Primary: `pnpm migrate:prod` (loads `infra/secrets.env`). Fallback: Supabase MCP `apply_migration` + INSERT the journal row (`hash` = sha256 of the `.sql`, `created_at` = journal `when`). Then enable **manual linking** + the Google/Facebook providers in the prod dashboard. Verify: `get_advisors(security)` clean (the new SECURITY DEFINER fn is `REVOKE`d, so no new EXECUTE-grant advisory); the trigger present on prod `auth.identities`.

- [ ] **Step 4: Record** applied prod state in the plan's completion notes.

---

## Verification (end-to-end, Phase 2)

```bash
env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/test-support test identity-link-sync   # trigger green
pnpm --filter @autodidact/mobile test        # seam (link) + UpgradeAccountCard + Phase 1 suites green
pnpm --filter @autodidact/mobile typecheck
# Manual (dev build + manual-linking on): guest → Continue with Google/Facebook → linked, is_anonymous=false,
#   progress retained (same UUID); public.users email populated; email-upgrade path still works.
```

**Done when:** a guest can link Google/Facebook and become a permanent user with UUID + progress preserved; the `0011` trigger keeps `public.users` synced (test-covered + real-GoTrue verified); manual linking enabled local + prod; `0011` applied local + prod; all Jest + test-support suites + typecheck green; docs updated.

## Self-review notes (spec coverage)

- **D5 Phase 2 mapped:** verify + fallback → Task 1 (defensive `0011` trigger, test-covered) + Task 5 Step 2 (real-GoTrue verify); `linkIdentity` upgrade → Task 2 (web flow, both providers) + Task 3 (UpgradeAccountCard). The ADR-028 trigger-miss risk is closed by the defensive trigger.
- **linkIdentity = web for both** (no native linking) — resolved in Architecture/Global Constraints. **manual_linking** prerequisite surfaced (Tasks 2/5). **Reconcile from server `is_anonymous`** preserved.
- **DRY:** `exchangeViaWebBrowser` shared by `signInWithFacebook` + both link functions (refactor of Phase 1 FB, same file — improving code being touched).
- **Backend/prod:** `0011` is the only DB change (mirrors `0007`/`0008` hardening); owner-gated prod apply via `pnpm migrate:prod` / MCP. No app-layer provisioning logic added (ADR-028 split intact).
- **No placeholders;** types consistent (`SocialSession` reused; `setSession(at,rt,false)`).
