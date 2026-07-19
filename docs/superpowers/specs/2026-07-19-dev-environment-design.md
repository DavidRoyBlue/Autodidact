# Working Mobile Dev Environment — Design

**Date:** 2026-07-19
**Status:** Approved (brainstormed with owner; scope answers recorded below)

## Context

Since social sign-in landed, the mobile app crashes on boot in Expo Go (`'RNGoogleSignin' could
not be found` — native module). A custom dev client is required, but no EAS build has ever
succeeded: `app.json` references `apps/mobile/assets/{icon,adaptive-icon,splash}.png` and that
directory does not exist, so both build attempts (dev 2026-06-24, production 2026-06-17) died in
prebuild. Local Supabase auth is half wired: anonymous sign-ins and manual linking are enabled in
`supabase/config.toml`, but no `[auth.external.google]` block exists. Full analysis:
[`docs/deployment.md`](../../deployment.md).

## Goal / success criteria

A working dev environment using dev versions of exactly what prod uses — no new tools:

1. `eas build --profile development` produces an installable dev-client APK (existing EAS project,
   profile, and managed keystore).
2. `pnpm mobile:run` opens the app in the dev client (Expo Go remains the fallback when no dev
   client is installed).
3. Guest + email sign-in work against the **local** Supabase stack.
4. **Google native sign-in works end-to-end against the local stack** — same code path as prod
   (`signInWithIdToken` → GoTrue), only the Supabase URL differs.
5. One `preview` profile build comes out green (proves the store path compiles; no Play submission).

Owner's scope decisions: full Google-in-dev · placeholder assets · EAS cloud builds · one preview
build included.

## Design

### 1. Assets (unblocks every build)

Three committed PNGs in `apps/mobile/assets/`: `icon.png` (1024×1024), `adaptive-icon.png`
(foreground layer), `splash.png`. Placeholder style: dark navy `#0f172a` + "A" glyph. Generated
once with a throwaway script (not committed). Real branding swaps in later with zero code changes.

### 2. Dev client build

`eas build --profile development --platform android` (cloud). Gate first with a local
`expo prebuild` dry-run so a broken config never burns a ~40-min cloud build. Install the APK on
the `Medium_Phone` AVD via adb. Rebuild only when native deps or app config change.

### 3. Launch wiring (`scripts/run-mobile.sh`)

If `com.autodidact.app` is installed on the device, open the project in the dev client (deep link
to Metro on 8081); otherwise keep today's Expo Go path and warn. Same entry point
(`pnpm mobile:run`), no new scripts. Existing `adb reverse` wiring (8081/3000/55321) unchanged.

### 4. Google auth against the local stack

`supabase/config.toml` gains:

```toml
[auth.external.google]
enabled = true
client_id = "232057392869-226j0moceo2m8kbhkhjo8i6bb10iullb.apps.googleusercontent.com"  # Web client ID (public)
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
skip_nonce_check = true  # Android native sheet sends no nonce
```

- Secret lives in `.env.dev` (documented in `.env.example`); same value as the prod Supabase
  dashboard's Google provider. The script that runs `supabase start` must export it (exact spot
  determined during planning).
- Runtime flow (all local): dev client → Metro resolves `extra` from `.env.dev`
  (`supabaseUrl=http://127.0.0.1:55321`) → native sheet returns ID token (audience = Web client
  ID) → `signInWithIdToken` → local GoTrue validates → session → local API on 3000.

**Owner manual step (not scriptable):** in Google Cloud Console, verify/create the **Android**
OAuth client for package `com.autodidact.app` + the EAS keystore SHA-1 (implementation hands over
the exact SHA-1 and a checklist). A Google account must be signed into the emulator (AVD is a
`google_apis_playstore` image, so Play services are present).

### 5. Prod-path proof

One `eas build --profile preview --platform android` after dev works; success = artifact produced.

### 6. Cleanup & docs

- Delete stray root `app.json` (`{"expo":{}}`, accidental).
- Update `docs/deployment.md` statuses; add the local-stack Google section to
  `apps/mobile/docs/social-sign-in.md`.

## Failure handling

| Failure | Handling |
|---|---|
| Cloud build fails | Diagnose from EAS logs (log-fetch flow proven 2026-07-18); prebuild dry-run gate makes this unlikely |
| `DEVELOPER_ERROR` from native sheet | Android client ID mismatch — re-verify package + SHA-1 (troubleshooting table in social-sign-in.md) |
| config.toml edits | Require local stack restart only; no migration |
| No dev client on device | `run-mobile.sh` falls back to Expo Go with a warning — plain-JS flow keeps working |

## Verification (becomes plan checkpoints)

1. `expo prebuild` dry-run passes locally.
2. EAS dev build green; APK installs on the AVD.
3. `pnpm mobile:run` opens the project in the dev client with Metro serving.
4. Guest + email sign-in succeed against the local stack.
5. Google sign-in end-to-end: session established; user row visible in local `auth.users` /
   `public.users`.
6. `preview` build green.

No new unit tests: no app-code changes expected (`social-auth.ts` already implemented); changes
are assets, shell script, and config — verified by the E2E checkpoints above.

## Out of scope

Real branding assets · Facebook-in-dev (web-PKCE, works without native config; verified
opportunistically at most) · Play Console / `eas submit` setup · local Gradle build path.
