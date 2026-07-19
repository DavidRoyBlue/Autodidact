# Working Mobile Dev Environment — Design

**Date:** 2026-07-19
**Related:** [`2026-06-22-social-sign-in-design.md`](../in-progress/2026-06-22-social-sign-in-design.md) — its remaining owner-gated work (provider config + verification) is executed here for the dev environment.

## Context

Since social sign-in landed, the mobile app crashes on boot in Expo Go (`'RNGoogleSignin' could
not be found` — native module). A custom dev client is required, but no EAS build has ever
succeeded: `app.json` references `apps/mobile/assets/{icon,adaptive-icon,splash}.png` and that
directory does not exist, so both build attempts (dev 2026-06-24, production 2026-06-17) died in
prebuild. Local Supabase auth is half wired: anonymous sign-ins and manual linking are enabled in
`supabase/config.toml`, but no `[auth.external.google]` block exists. Full analysis:
[`docs/deployment.md`](../../../deployment.md).

## Goal / success criteria

A working dev environment using dev versions of exactly what prod uses — no new tools:

1. `eas build --profile development` produces an installable dev-client APK (existing EAS project,
   profile, and managed keystore).
2. `pnpm mobile:run` opens the app in the dev client. With no dev client on the device it **fails
   fast** with build/install instructions — the dev client is the only supported dev path, since
   the app crashes on boot in Expo Go and making the native import lazy is out of scope.
3. Guest + email sign-in work against the **local** Supabase stack.
4. **Google native sign-in works end-to-end against the local stack** — same app code path as prod
   (`signInWithIdToken` → GoTrue); only the Supabase URL differs (plus the dev-only
   `skip_nonce_check` GoTrue setting).
5. One `preview` profile build comes out green — proves a release-mode, prod-pointing **APK**
   compiles. (The store `.aab` path — `production` profile — remains unproven; future work.)

Owner's scope decisions: full Google-in-dev · placeholder assets · EAS cloud builds · one preview
build included.

## Design

### 1. Assets (unblocks every build)

Three committed PNGs in `apps/mobile/assets/`: `icon.png` (1024×1024), `adaptive-icon.png`
(foreground layer), `splash.png`. Placeholder style: dark navy `#0f172a` + "A" glyph. Generated
once with a throwaway script (not committed). Real branding swaps in later with zero code changes.

### 2. Dev client build

`eas build --profile development --platform android` (cloud). **Prebuild gate first** (the
anti-waste mechanism must not itself corrupt builds): verify the three asset files exist and are
valid PNGs, then rehearse with `npx expo prebuild --platform android --no-install` followed by a
**mandatory** `rm -rf apps/mobile/android` — a leftover `android/` dir silently flips EAS from
managed to bare workflow. The plan must also confirm `android/` is gitignored for `apps/mobile`.
Install the APK on the `Medium_Phone` AVD via adb.

Rebuild triggers (the top future footgun — be concrete): any change to `app.json` /
`app.config.ts` plugins, or adding/upgrading a dependency that contains native code. Pure JS/TS
changes never need a rebuild; Metro serves them.

If EAS cloud is unavailable (outage, queue, free-tier quota): wait — the effort is only 2–3
builds total; lift the local-Gradle exclusion only if blocked more than a day.

### 3. Launch wiring (`scripts/run-mobile.sh`)

- Detect the **dev client**, not mere package presence — resolve the `expo-dev-client` launcher
  component (e.g. via `dumpsys package com.autodidact.app`). Package presence is not enough: the
  `preview` APK shares the package name, and installing it replaces the dev client (they collide
  on the same AVD — the script warning should say so).
- Dev client found → open the project via the dev-client deep link to Metro on 8081.
  Not found → fail fast with the exact build/install commands.
- The three `adb reverse` calls (8081 Metro, 3000 API, 55321 Supabase) must run on **every**
  path — hoist them out of the current Expo-Go-only branch, including the "Metro already
  running" early-exit (today an emulator reboot after that exit leaves no reverses).

### 4. Google auth against the local stack

`supabase/config.toml` gains:

```toml
[auth.external.google]
enabled = true
# Same Web client ID as the EAS build profiles (eas.json is the source of truth; public value)
client_id = "232057392869-226j0moceo2m8kbhkhjo8i6bb10iullb.apps.googleusercontent.com"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
skip_nonce_check = true  # dev-only divergence: the Android native sheet sends no nonce
```

- **Secret is expected to be unnecessary** for the `signInWithIdToken` flow — GoTrue validates
  the ID token against Google's JWKS; the client secret is only used for web code-exchange.
  Implementation verifies this: `.env.example` (and `.env.dev`) ship a **dummy placeholder** so
  `env()` always resolves and `supabase start` / `pnpm dev` / `pnpm setup` never break on a
  missing var. Do **not** copy the prod Google secret into dev env — if the dummy turns out
  insufficient, that finding goes in the docs and the owner decides.
- Precondition: the local GoTrue container has outbound HTTPS to Google's JWKS endpoint.
- Runtime flow (all local): dev client → Metro resolves `extra` from `.env.dev`
  (`supabaseUrl=http://127.0.0.1:55321`, reachable via the adb reverses of §3) → native sheet
  returns ID token (audience = Web client ID) → `signInWithIdToken` → local GoTrue validates →
  session → local API on 3000.

**Owner manual step (not scriptable):** in Google Cloud Console, verify/create the **Android**
OAuth client for package `com.autodidact.app` + the EAS keystore SHA-1 (implementation hands over
the exact SHA-1 and a checklist). A Google account must be signed into the emulator.

### 5. Prod-path proof

One `eas build --profile preview --platform android` after dev works; success = artifact produced.
Do not install it on the dev AVD (package-name collision with the dev client, §3).

### 6. Cleanup & docs

- Delete stray root `app.json` (`{"expo":{}}`, accidental).
- Update `docs/deployment.md` statuses; add the local-stack Google section to
  `apps/mobile/docs/social-sign-in.md`.

## Failure handling

| Failure | Handling |
|---|---|
| Cloud build fails | Diagnose from EAS logs (log-fetch flow proven 2026-07-18); prebuild gate makes this unlikely |
| Cloud build unavailable (outage/quota) | Wait; escalate to local Gradle only if blocked > 1 day |
| `DEVELOPER_ERROR` from native sheet | Android client ID mismatch — re-verify package + SHA-1 (troubleshooting table in social-sign-in.md) |
| config.toml edits | Require local stack restart only; no migration |
| No dev client on device | `run-mobile.sh` fails fast with build/install instructions (Expo Go would crash on boot — not a fallback) |

## Verification (becomes plan checkpoints)

0. AVD precondition: `Medium_Phone` is a `google_apis_playstore` image (**verified 2026-07-19**
   via its `config.ini`: `PlayStore.enabled=true`) and a Google account is signed in on it.
1. Prebuild gate passes (assets valid; prebuild rehearsal clean; `android/` removed and ignored).
2. EAS dev build green; APK installs on the AVD.
3. `pnpm mobile:run` opens the project in the dev client with Metro serving; reverses in place.
4. Guest + email sign-in succeed against the local stack.
5. Google sign-in end-to-end: session established; user row visible in local `auth.users` /
   `public.users`.
6. `preview` build green (artifact produced; not installed on the dev AVD).

No new unit tests: no app-code changes expected (`social-auth.ts` already implemented); changes
are assets, shell script, and config — verified by the E2E checkpoints above.

## Out of scope

Real branding assets · lazy-loading the native Google module to revive Expo Go · Facebook-in-dev
(web-PKCE, works without native config; verified opportunistically at most) · Play Console /
`eas submit` setup · local Gradle build path.
