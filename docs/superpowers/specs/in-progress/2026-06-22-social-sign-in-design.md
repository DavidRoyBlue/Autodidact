# Social Sign-In (Google + Facebook) — Design Spec

**Date:** 2026-06-22
**Status:** In progress (as of 2026-06-24) — both phases code-complete on `master` but not yet shipped or verified. Plans: [Phase 1](../../plans/in-progress/2026-06-22-social-sign-in-phase1-oauth-sign-in.md), [Phase 2](../../plans/in-progress/2026-06-22-social-sign-in-phase2-guest-oauth-upgrade.md). Remaining = owner-gated OAuth provider config + prod migration apply (`0011`/`0012`) + real-device verification; see `note-to-self.md`.
**Position:** Auth track, builds on **Spec 2** (production auth). Makes Google + Facebook the **primary** sign-in methods in the mobile app; email/password and anonymous guest are kept. Closes the OAuth gap that **Plan B1 explicitly deferred** ("OAuth `linkIdentity` upgrade … deferred until OAuth sign-in is added" — ADR-028 follow-up).

> **Cross-refs:** Spec 2 `2026-06-18-production-auth-design.md` (provisioning trigger, JWKS verification, anonymous flow); [ADR-028](../../../architecture/ADRs/cross-cutting/ADR-028-production-auth-provisioning.md) (provider-agnostic provisioning; the open `linkIdentity` / `auth.identities` follow-up); [ADR-020](../../../architecture/ADRs/cross-cutting/ADR-020-authentication-strategy.md) (Supabase Auth). The `apps/mobile` invariant: the app talks only to `services/api` for protected data.

---

## Problem

The mobile sign-in screen offers only email/password and "continue as guest" (anonymous). Social sign-in is the expected default for a consumer mobile app and lowers signup friction. The **backend is already provider-agnostic** — the `handle_new_user` trigger provisions a `public.users` row on any `auth.users` INSERT, and the API verifies JWTs via JWKS regardless of provider — but the **mobile app has no OAuth wiring at all**: no `signInWithOAuth`/`signInWithIdToken`, no OAuth libraries, no deep-link callback handler, no provider buttons.

## Goals

- Google and Facebook are the **headline** sign-in methods on the auth screen.
- Email/password and anonymous guest are **retained** (email demoted behind a "use email instead" affordance; guest kept for low-friction onboarding — preserves the B1/B2 work).
- A new social signup lands in the authenticated app with a provisioned `public.users` row via the existing trigger — no backend change.
- A UI/store seam (`social-auth.ts`) hides which mechanism (native vs web) a provider uses.

## Non-goals

- **Guest → OAuth upgrade (`linkIdentity`)** — deferred to **Phase 2** (see Decisions D5). A guest who wants a real Google/Facebook account signs in fresh in Phase 1.
- Backend / DB changes — none required (D4).
- Additional providers (Apple, etc.) — out of scope; the seam leaves room for them.
- Replacing email/password or removing guest — both stay.
- Magic links / phone OTP.

---

## Verified current state (foundation)

- **Mobile client** (`apps/mobile/src/lib/supabase.ts`): `createClient(..., { auth: { autoRefreshToken: true, persistSession: false, detectSessionInUrl: false } })`. No `storage` adapter, no `flowType`. Session persistence is owned by `src/stores/auth.store.ts` (SecureStore) + the `onAuthStateChange` listener in `app/_layout.tsx`.
- **Sign-in screen** (`app/(auth)/sign-in.tsx`): email/password (`signInWithPassword`) + "Continue as guest" (`signInAnonymously`). No OAuth.
- **Scheme**: `autodidact://` is set in `app.json`; nothing listens for an OAuth callback.
- **Deps**: none of `@react-native-google-signin/google-signin`, `expo-web-browser`, `expo-auth-session`, `expo-linking` are installed. Dev runs in **Expo Go** (`pnpm mobile:run`); `eas.json` has a `development` profile with `developmentClient: true`.
- **Backend**: `handle_new_user` trigger (migration `0007`) fires `AFTER INSERT ON auth.users` for every provider; `SupabaseAuthProvider.verifyToken` checks RS256 via JWKS with `audience: 'authenticated'` — provider-agnostic. **No change needed.**
- **Guard** (`app/_layout.tsx`): D8 precedence (restore session → route; DEV_AUTO_LOGIN slot; else auth UI). OAuth buttons slot into the auth UI; a successful OAuth sign-in produces a session that the existing `onAuthStateChange` listener routes into `(app)`.

---

## Decisions & drivers

- **D1 — Hybrid flow, one seam.** **Google = native** (`@react-native-google-signin/google-signin` → `signInWithIdToken({ provider: 'google', token })`, no browser, best UX); **Facebook = web PKCE** (`signInWithOAuth({ provider:'facebook', options:{ redirectTo, skipBrowserRedirect:true } })` → `WebBrowser.openAuthSessionAsync` → `exchangeCodeForSession`). Facebook's native id-token support is poor, so a uniform native path isn't viable; the web flow covers it. Both are hidden behind `src/lib/social-auth.ts` exposing `signInWithGoogle()` / `signInWithFacebook()` so the UI and store are mechanism-agnostic.
- **D2 — Custom dev build (leave Expo Go).** Native Google requires a config plugin + native modules, which Expo Go cannot load. Dev moves to an EAS-built dev client: `eas build --profile development --platform android` (cloud build avoids WSL2 toolchain friction), install the APK on the emulator. **Day-to-day JS iteration is unchanged** (Metro fast-refresh); a rebuild is needed only when native deps change. `expo-dev-client` is added.
- **D3 — PKCE + a SecureStore storage adapter on the Supabase client (mandatory).** The Facebook web flow uses PKCE; the code-verifier must persist across the browser round-trip. Today the client has `persistSession: false` and no `storage`, so the verifier would be lost. Add `flowType: 'pkce'` and a minimal `expo-secure-store` storage adapter. The auth **store** remains the owner of the app session (via `onAuthStateChange`); the adapter exists only for supabase-js's internal PKCE/flow state.
- **D4 — Backend unchanged.** Provisioning trigger + JWKS verification already cover OAuth users (verified). No migration, no API change.
- **D5 — Guest → OAuth upgrade is Phase 2 (not at launch).** `linkIdentity` is the upgrade primitive, but ADR-028 flags a real risk: `linkIdentity` may write `auth.identities` **without** touching `auth.users.email`/`is_anonymous`, so the column-scoped `sync_user_from_auth` trigger (`AFTER UPDATE OF email, is_anonymous ON auth.users`) could **silently miss** the sync — leaving a provisioned `public.users` row stale. Phase 2 must verify the actual `linkIdentity` behavior against real GoTrue and, if the gap is real, add a fallback (a trigger on `auth.identities` INSERT, or an explicit API-layer sync on an upgrade endpoint). Shipping this at launch would risk an invisible-until-reported broken-profile bug; no user story requires it for Phase 1.
- **D6 — Provider config is dashboard + cloud console (documented, owner-applied).** Enable Google + Facebook providers in Supabase Auth; add `autodidact://auth-callback` to the redirect allow-list. **Google needs two Android OAuth client IDs** (D6a) plus a Web client ID (used by Supabase / the native `signInWithIdToken` audience). Facebook needs an app ID/secret.
- **D6a — Two Android OAuth client IDs (dev vs prod SHA-1).** Native Google binds the OAuth client to the Android app's signing-key **SHA-1**. The EAS **dev build** is signed with a different key than the **production** build, so Google Cloud Console needs **two** Android client IDs — one bound to the dev-build SHA-1, one to the prod key SHA-1 (retrieve via `eas credentials`). The setup docs MUST call this out so it is not missed when moving dev → prod.

---

## Architecture (by phase)

### Phase 1 — OAuth sign-in for new sessions

**1a — Deps + native config.** Add `@react-native-google-signin/google-signin`, `expo-web-browser`, `expo-linking`, `expo-dev-client`. Register the Google config plugin + the `auth-callback` deep-link path on the `autodidact://` scheme in `app.config.ts`. Wire Google client IDs / Facebook app id via `extra` (env-driven, per Spec 1). **Call `GoogleSignin.configure({ webClientId: extra.googleWebClientId })` exactly once at app startup — in `app/_layout.tsx`** (alongside the existing session-restore / `onAuthStateChange` wiring), not inside the seam or the button handler. `webClientId` is the **Web** OAuth client ID (the audience the Supabase id-token exchange expects), distinct from the Android client IDs of D6a.

**1b — Supabase client (`src/lib/supabase.ts`), per D3.** Add `flowType: 'pkce'` and a SecureStore `storage` adapter. Keep `persistSession: false`, `detectSessionInUrl: false`.

**1c — The seam (`src/lib/social-auth.ts`), per D1.**
- `signInWithGoogle()`: `await GoogleSignin.hasPlayServices()` (Android guard — surfaces a clean error on devices without Play Services) → `GoogleSignin.signIn()` → ID token → `supabase.auth.signInWithIdToken({ provider:'google', token })`. (`configure()` already ran at startup, per 1a.)
- `signInWithFacebook()`: `signInWithOAuth({ provider:'facebook', options:{ redirectTo: makeRedirectUri({ scheme:'autodidact', path:'auth-callback' }), skipBrowserRedirect:true } })` → `WebBrowser.openAuthSessionAsync(url, redirectTo)`. **The callback URL comes back as `result.url` on a `result.type === 'success'`** — parse the `code` from *that* URL (`new URL(result.url).searchParams.get('code')`), then `exchangeCodeForSession(code)`. **Do NOT use `Linking.addEventListener`/`getInitialURL`** — `openAuthSessionAsync` returns the redirect synchronously to its caller, so no global deep-link listener is involved (a `type` of `cancel`/`dismiss` is the user-cancel path).
- Both return a uniform result; the existing `onAuthStateChange` listener populates the store and routes into `(app)`. Handle user-cancel and error without crashing (mirror the existing guest/email error handling).

**1d — UI (`app/(auth)/sign-in.tsx`).** Google + Facebook buttons as the headline. Email/password collapses behind a "use email instead" affordance. "Continue as guest" stays. No change to `app/_layout.tsx` precedence (a social session is just a session).

### Phase 2 — Guest → OAuth upgrade (separate plan, per D5)
Verify `linkIdentity` vs the `sync_user_from_auth` trigger against real GoTrue; add the `auth.identities` fallback if the column-scoped trigger misses; extend `UpgradeAccountCard` with Google/Facebook upgrade. **Out of scope for the Phase 1 plan.**

---

## Error handling

- User-cancel (closes the Google sheet / FB browser) → no-op, return to the sign-in screen; never crash (mirror existing handlers).
- OAuth error / token exchange failure → surface a non-technical message; log via the app's logger; fall through to the sign-in screen.
- Provider misconfig (e.g. SHA-1 mismatch) surfaces as a Google sign-in error — the setup docs (D6a) are the mitigation.
- A successful sign-in that somehow lacks a provisioned `public.users` row surfaces as the existing loud API 500 (ADR-028 1c) — not expected, since the trigger is provider-agnostic.

## Testing

- **Unit-test the seam** (`src/lib/social-auth.ts`) with the Google SDK + `supabase` + `WebBrowser` mocked: asserts `signInWithIdToken` (Google) and `openAuthSessionAsync` + `exchangeCodeForSession` (Facebook) are called with the right args; the store is populated on success; cancel and error paths are no-crash. Follows the `apps/mobile` jest mocking rules (mock at the seam).
- **Client config** unit check: PKCE flow + storage adapter present.
- **Manual verification on the dev build** (native sheets can't be driven in CI): real Google sign-in lands authenticated with a provisioned row; real Facebook web flow round-trips through `autodidact://auth-callback`; email/guest still work.

## Affected areas

- `apps/mobile` — new `src/lib/social-auth.ts`; `src/lib/supabase.ts` (PKCE + storage); `app/(auth)/sign-in.tsx` (buttons + email demotion); `app.config.ts` (plugin + scheme path + provider ids); `package.json` (deps); `eas.json` (dev client already present). **No `services/*`, no `packages/db` changes.**
- Docs: setup runbook (Supabase provider enablement, Google **two** Android client IDs + Web client ID per D6a, Facebook app, redirect allow-list, dev-build steps).

## Rollout, risks, open items

- **Owner setup (one-time):** Supabase Google/Facebook providers; Google Web + **two** Android client IDs (dev + prod SHA-1, D6a); Facebook app; `autodidact://auth-callback` in the redirect allow-list; `eas build --profile development`.
- **Risk — dev/prod SHA-1 mismatch (D6a):** the top cause of "Google sign-in works in dev, breaks in prod" (or vice-versa). Documented explicitly.
- **Risk — PKCE verifier persistence (D3):** without the storage adapter the FB flow fails silently mid-handshake. Covered by the client-config check.
- **OPEN (Phase 2):** `linkIdentity` vs the column-scoped `sync_user_from_auth` trigger — verify + fallback (D5). Tracked from ADR-028's follow-up.
- **Decomposition:** Phase 1 is one implementation plan; Phase 2 (guest→OAuth upgrade) is a separate later plan.
