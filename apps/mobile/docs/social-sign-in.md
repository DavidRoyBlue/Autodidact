# Social Sign-In Setup Runbook

Social sign-in (Google native + Facebook web-PKCE) requires configuration in three places: Supabase Dashboard, Google Cloud Console, and the local `.env.dev`. The app must run on a **custom dev build** (not Expo Go) because native Google sign-in cannot run in the Expo Go sandbox.

---

## 1. Supabase Dashboard setup

### Enable providers and set redirect URL

1. Go to your Supabase project → **Authentication** → **Providers**
2. Enable **Google**:
   - Paste the **Web OAuth client ID** (from Google Cloud Console) into the `Client ID` field
   - Paste the **Web OAuth client secret** into the `Client secret` field
   - Click **Save**
3. Enable **Facebook**:
   - Paste the **Facebook App ID** into the `App ID` field
   - Paste the **Facebook App Secret** into the `App Secret` field
   - Click **Save**
4. Under **Authentication** → **URL Configuration** → **Redirect URLs**, add:
   ```
   autodidact://auth-callback
   ```
   This URL is called by the native Google sheet and the Facebook in-app browser when sign-in succeeds.

---

## 2. Google Cloud Console setup

### Create OAuth client IDs

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → your project → **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Choose **Web application**:
   - Give it a name (e.g., "Autodidact Web")
   - Under **Authorized JavaScript origins**, add `https://localhost:3000` (for dev/testing)
   - Under **Authorized redirect URIs**, add your Supabase callback:
     ```
     https://<your-supabase-project>.supabase.co/auth/v1/callback
     ```
   - Click **Create**
   - **Copy the Client ID** — this is your `GOOGLE_WEB_CLIENT_ID` (set in step 3 below and in Supabase)

4. **Create two Android OAuth client IDs** — one for dev build, one for prod:
   - Click **Create Credentials** → **OAuth client ID** → **Android**
   - For the **dev build**, the SHA-1 of the keystore `scripts/run-mobile.sh` signs with —
     the generated debug keystore, for both variants:
     ```bash
     keytool -list -v -keystore apps/mobile/android/app/debug.keystore \
       -alias androiddebugkey -storepass android | grep SHA1
     ```
     EAS `development`/`preview` builds are signed with the EAS keystore and need their own Android client.
   - Create an Android OAuth client with:
     - **Package name:** `com.autodidact.app` (must match `android.package` in `app.json`)
     - **SHA-1 certificate fingerprint:** (paste the dev keystore SHA-1)
     - Click **Create**
   - For the **production key**, repeat with the prod keystore SHA-1. **This second client ID is critical — forgetting it is the usual cause of "Google works in dev, fails in prod."**
   - Save both Android client IDs (you'll need them in Supabase and for manual testing)

---

## 3. Facebook App setup

1. Go to [Meta App Dashboard](https://developers.facebook.com/apps)
2. Create a new app or use an existing one
3. Under **Settings** → **Basic**, copy the **App ID** and **App Secret** (set in Supabase)
4. Under **Products**, add **Facebook Login**
5. Go to **Facebook Login** → **Settings**:
   - Under **Valid OAuth Redirect URIs**, add:
     ```
     https://<your-supabase-project>.supabase.co/auth/v1/callback
     ```
   - Click **Save Changes**
6. Go to **Settings** → **Basic**, scroll down to **App Domains** and add:
   ```
   autodidact://auth-callback
   ```
   (This allows the in-app browser callback to return to the app.)

---

## 4. Environment variables

### Local development (.env.dev)

Set these in the monorepo root `.env.dev`:

```bash
GOOGLE_WEB_CLIENT_ID=<Web OAuth client ID from Google Cloud Console>
FACEBOOK_ENABLED=true
```

The app reads these at build time and injects them into `extra` via `app.config.ts`.

### EAS build profiles

For cloud builds (eas build), set the same variables in `eas.json` per profile:

```json
{
  "build": {
    "development": {
      "env": {
        "GOOGLE_WEB_CLIENT_ID": "<Web OAuth client ID>",
        "FACEBOOK_ENABLED": "true"
      }
    },
    "production": {
      "env": {
        "GOOGLE_WEB_CLIENT_ID": "<Web OAuth client ID>",
        "FACEBOOK_ENABLED": "true"
      }
    }
  }
}
```

---

## 5. Building and running on a device

Native Google sign-in does not run in **Expo Go**. Build and install the app with
`scripts/run-mobile.sh --release` (local WSL gradle; see its header) — it includes
the native Google SDK. Rebuild after any native change (plugins, `app.config.ts`,
a dependency with native code); pure JS/TS changes are checked the same way.

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Google works in dev, fails in prod" | Forgot the prod Android client ID in Google Cloud Console | Create both dev AND prod Android client IDs; add both to Supabase |
| Native Google sheet doesn't appear | Running in Expo Go or a stale APK | Rebuild with `scripts/run-mobile.sh --release` |
| Facebook redirect doesn't work | Redirect URI not set in Facebook app or not added to Supabase | Check both: Facebook App Dashboard → Login → Settings, and Supabase → URL Configuration |
| "Invalid client" errors | Mismatched client IDs between Supabase and Google/Facebook dashboards | Verify Supabase has the correct Web client ID and secrets |

---

---

## Local stack (dev)

Google sign-in works against the **local** Supabase stack — same `signInWithIdToken` → GoTrue
flow as prod. Wiring (all committed 2026-07-19):

- `supabase/config.toml` has `[auth.external.google]` with `client_id = "env(GOOGLE_WEB_CLIENT_ID)"`,
  a **dummy** secret (`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=dev-dummy-not-used` in `.env.dev` —
  the id-token flow validates via Google's JWKS, no real secret; never put the prod secret in dev
  env), and `skip_nonce_check = true` (the Android native sheet sends no nonce).
- The APK reaches the local stack at `http://<PC LAN address>:55321` on a phone, `http://10.0.2.2:55321`
  on the emulator (baked in by `run-mobile.sh`;
  **not** `adb reverse` — broken across the Windows-adb-server/WSL split).
- **One-time per AVD:** a Google account must be signed into the emulator (Settings → Accounts,
  or complete the sheet's sign-in form once). The account lives on the AVD's data partition and
  survives reboots; only `-wipe-data`/AVD recreation loses it.

| Local-stack symptom | Cause / fix |
|---|---|
| `DEVELOPER_ERROR` from the native sheet | Google-side: Android client package/SHA-1 mismatch (see §2) |
| GoTrue 400 on `signInWithIdToken` | Local-side: `docker logs supabase_auth_Autodidact`; check JWKS reachability and token `aud` vs `client_id` |
| Sheet asks for full Google credentials | No account on the AVD yet — the one-time step above |

## Phase 2 — guest → OAuth upgrade

When a guest (anonymous) user reaches the profile screen, `UpgradeAccountCard` offers "Continue with Google" and "Continue with Facebook" buttons. Tapping either invokes the web `linkIdentity` flow via `linkWithGoogle()` or `linkWithFacebook()` (in [`src/lib/social-auth.ts`](../src/lib/social-auth.ts)), which links the OAuth provider to the existing guest account without requiring a password.

### Prerequisites

**Supabase Dashboard:** Enable **manual linking** in the auth settings.

1. Go to your Supabase project → **Authentication** → **Settings**
2. Under **Manage sign-up** → **Manual linking**, toggle **Enable manual linking** ON
3. Save

This permits `linkIdentity` calls from the client.

### Configuration

**Backend (`config.toml`):** The Supabase auth service must also have `enable_manual_linking = true` in its PostgREST config. This is set during initial setup and confirmed in the local dev environment.

### How it works

1. Guest user navigates to the profile screen
2. `UpgradeAccountCard` appears (hidden for non-guests)
3. User taps "Continue with Google" or "Continue with Facebook"
4. The social auth flow runs (native Google sheet or web-PKCE Facebook browser)
5. On success, `supabase.auth.linkIdentity(provider, { redirectTo: ... })` binds the provider to the existing guest session
6. User is now linked — future sign-ins via that provider reach the same account
7. The [`AFTER INSERT ON auth.identities` trigger (migration `0011`)](../../packages/db/migrations/0011_identity_link_sync.sql) ensures `public.users` is updated with the linked provider; this is defensive — the `sync_user_from_auth` column trigger (migration `0007`) also syncs the user, but the identity-link trigger adds belt-and-suspenders coverage

### Production deployment

1. **Database:** Run the identity-link trigger migration via:
   ```bash
   pnpm migrate:prod
   ```
2. **Supabase Dashboard:** Enable manual linking in the prod project's auth settings (same steps as above)

After both steps, guests on production can upgrade to OAuth accounts.

---

## See also

- [`src/lib/social-auth.ts`](../src/lib/social-auth.ts) — seam implementation (Google native via `signInWithIdToken`, Facebook web-PKCE via `openAuthSessionAsync`, OAuth linking via `linkIdentity`)
- [`src/components/auth/UpgradeAccountCard.tsx`](../src/components/auth/UpgradeAccountCard.tsx) — upgrade UI for guests
- [`packages/db/migrations/0011_identity_link_sync.sql`](../../packages/db/migrations/0011_identity_link_sync.sql) — identity-link sync trigger
- [`apps/mobile/AGENTS.md`](../AGENTS.md) — Auth invariants and dev-build requirement
