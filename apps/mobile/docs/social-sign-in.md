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
   - For the **dev build**, get its signing SHA-1:
     ```bash
     cd apps/mobile
     eas credentials --platform android
     # Navigate: Android → Manage credentials → choose the dev keystore
     # Copy the "SHA-1 fingerprint"
     ```
   - Create an Android OAuth client with:
     - **Package name:** `com.blueking.autodidact`
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

## 5. Building and running on a dev build

Native Google sign-in does not run in **Expo Go** (the sandboxed preview). You must build and install a **custom dev build** that includes the native Google Sign-In SDK.

### First build (cloud)

```bash
cd apps/mobile
eas build --profile development --platform android
```

This creates a custom APK that includes the native Google SDK. Grab the APK URL from the CLI output.

### Install on emulator or device

```bash
# Download and install the APK on the Android emulator or device
adb install <path-to-apk>
```

Or use the EAS simulator:
```bash
eas build --profile development --platform android --device
```

### Start Metro for JS iteration

Once the APK is installed:

```bash
pnpm --filter @autodidact/mobile start
```

This starts the Expo development server (Metro bundler). The app will hot-reload your JS changes without rebuilding the native code.

**Day-to-day workflow:** edit JS, fast-refresh picks it up. Only rebuild the APK when native dependencies change.

---

## 6. Testing the flow

### On the dev build

1. **Google Sign-In** → tap "Continue with Google" → native sheet appears → sign in → automatically navigates to the app home screen
2. **Facebook Sign-In** → tap "Continue with Facebook" → in-app browser opens → sign in → redirects to `autodidact://auth-callback` → app receives the auth code and completes sign-in
3. **Email / Password** → tap "Use email instead" → email/password form appears (retained from Phase 0)
4. **Guest** → tap "Continue as guest" → anonymous session created, app enters immediately

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Google works in dev, fails in prod" | Forgot the prod Android client ID in Google Cloud Console | Create both dev AND prod Android client IDs; add both to Supabase |
| Native Google sheet doesn't appear | Running in Expo Go or didn't rebuild the dev APK | Rebuild with `eas build --profile development --platform android` |
| Facebook redirect doesn't work | Redirect URI not set in Facebook app or not added to Supabase | Check both: Facebook App Dashboard → Login → Settings, and Supabase → URL Configuration |
| "Invalid client" errors | Mismatched client IDs between Supabase and Google/Facebook dashboards | Verify Supabase has the correct Web client ID and secrets |

---

## See also

- [`src/lib/social-auth.ts`](../src/lib/social-auth.ts) — seam implementation (Google native via `signInWithIdToken`, Facebook web-PKCE via `openAuthSessionAsync`)
- [`apps/mobile/CLAUDE.md`](../CLAUDE.md) — Auth invariants and dev-build requirement
