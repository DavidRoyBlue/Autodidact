# Social Sign-In Phase 1 — Provider Config & Device Verification

**Date:** 2026-06-26
**Parent:** 2026-06-22-social-sign-in-phase1-oauth-sign-in.md

All Phase-1 (and Phase-2) social sign-in **code is merged and unit-tested on `master`**; the only thing left to ship the feature is owner-gated configuration and a real-device verification pass that an agent cannot do. This checklist walks the `apps/mobile/docs/social-sign-in.md` runbook step-by-step so it can be done one item at a time. Full runbook: [`apps/mobile/docs/social-sign-in.md`](../../../../apps/mobile/docs/social-sign-in.md). Authoritative cross-feature notes: [`note-to-self.md`](../../../../note-to-self.md).

> Native Google sign-in cannot run in Expo Go — the verification pass requires a custom EAS dev build. None of these flows has ever executed end-to-end; the device pass is the real proving ground.

## 1. Supabase Dashboard — enable providers (Supabase project `cbzdsoojfhpsexuyeyxt`)

- [ ] Authentication → Providers → enable **Google**: paste the **Web** OAuth client ID + secret (from step 2), Save.
- [ ] Authentication → Providers → enable **Facebook**: paste the Facebook App ID + secret (from step 3), Save.
- [ ] Authentication → URL Configuration → Redirect URLs: add `autodidact://auth-callback`.
- [ ] Authentication → Settings → Manage sign-up → **Enable manual linking** ON (required for the Phase-2 guest→OAuth upgrade `linkIdentity` flow).

## 2. Google Cloud Console — OAuth client IDs

- [ ] Create a **Web application** OAuth client → authorized redirect URI `https://<supabase-project>.supabase.co/auth/v1/callback`. Copy its Client ID → this is `GOOGLE_WEB_CLIENT_ID` (used in step 4 **and** in the Supabase Google provider).
- [ ] Create an **Android** OAuth client for the **dev build**: package `com.blueking.autodidact` + the **dev keystore SHA-1** (`cd apps/mobile && eas credentials --platform android` → dev keystore → SHA-1).
- [ ] Create a second **Android** OAuth client for **prod**: same package + the **prod keystore SHA-1**. ⚠️ Forgetting this one is the usual cause of "Google works in dev, fails in prod."

## 3. Facebook App (Meta App Dashboard)

- [ ] Create/choose an app; copy **App ID** + **App Secret** (→ Supabase, step 1).
- [ ] Add the **Facebook Login** product → Settings → Valid OAuth Redirect URIs: `https://<supabase-project>.supabase.co/auth/v1/callback`.
- [ ] Settings → Basic → App Domains: add `autodidact://auth-callback`. (Add the Android platform + key hashes.)

## 4. Environment variables

- [ ] Set `GOOGLE_WEB_CLIENT_ID=<web client id>` and `FACEBOOK_ENABLED=true` in the monorepo-root `.env.dev`.
- [ ] Set the same two vars in `apps/mobile/eas.json` under the `development` (and `production`) build profile `env` blocks.

## 5. Dev build + real-device verification (the actual proving ground)

- [ ] `cd apps/mobile && eas build --profile development --platform android` → install the resulting APK on the emulator/device.
- [ ] `pnpm --filter @autodidact/mobile start` (JS iteration stays on fast-refresh after the build).
- [ ] **Google:** "Continue with Google" → native sheet → lands in `(app)`; a `public.users` row exists (trigger).
- [ ] **Facebook:** "Continue with Facebook" → in-app browser → `autodidact://auth-callback` → lands in `(app)`.
- [ ] "Use email instead" still reveals the email/password form and signs in; "Continue as guest" still works.
- [ ] Cancelling either social flow returns to the sign-in screen with no crash.
- [ ] **Phase-2 upgrade (optional here — owned by #72):** as a guest, link Google/Facebook from the profile `UpgradeAccountCard` → **same UUID preserved**, `public.users.is_anonymous=false`, progress retained.

## 6. Close-out bookkeeping (after the device pass is green)

- [ ] Check off the verification boxes above + flip the parent Phase-1 plan's status note to shipped.
- [ ] `git mv` the Phase-1 plan, this config plan, and the social-sign-in spec → `_done/`, add `> Completed: <date>`, update the subfolder `README.md` indexes.
- [ ] Delete `note-to-self.md` once auth is fully shipped (per its own instruction).
