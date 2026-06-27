# Social Sign-In — Finish: Provider Config, Prod Migrations & Real-Device Verification

**Parent:** 2026-06-22-social-sign-in-design.md
**Date:** 2026-06-26

All Social Sign-In **code is merged to `master`** (Phase 1 sign-in + Phase 2 guest→OAuth upgrade) and is unit-verified against mocks. Nothing has ever run end-to-end. What remains to close parent #51 is **owner-gated config + prod migrations + a real-device verification pass** — none of which can be done in code. This checklist is the authoritative finish list (mirrors [`note-to-self.md`](../../../../note-to-self.md); full runbook in [`apps/mobile/docs/social-sign-in.md`](../../../../apps/mobile/docs/social-sign-in.md)). Do the steps in order — everything is blocked until the OAuth providers exist.

## 1. OAuth provider + dashboard setup (the unblocker)

Supabase prod project `cbzdsoojfhpsexuyeyxt` → Authentication:

- [ ] **Enable Google provider** (Authentication → Providers) — paste the Google **Web** client ID + secret.
- [ ] **Enable Facebook provider** — paste the Facebook app ID + secret.
- [ ] Add `autodidact://auth-callback` to the **Redirect URLs** allow-list.
- [ ] Enable **Manual linking** (Auth settings) — required for the Phase-2 guest→OAuth upgrade (`linkIdentity`); local `config.toml` already has it, **prod dashboard is separate**.

**Google Cloud Console** OAuth clients:
- [ ] Create one **Web** client → its ID is `GOOGLE_WEB_CLIENT_ID` (used by the app **and** the Supabase Google provider above).
- [ ] Create **TWO Android** clients (easy to miss): one bound to the **EAS dev-build** signing SHA-1, one to the **prod** key SHA-1. Get both via `cd apps/mobile && eas credentials` (Android → keystore). *Forgetting the prod Android client = "Google works in dev, breaks in prod."*

**Facebook** app:
- [ ] Add the Android platform + key hashes; set the OAuth redirect to the Supabase callback.

## 2. Env vars

- [ ] Set `GOOGLE_WEB_CLIENT_ID` and `FACEBOOK_ENABLED=true` in `.env.dev`.
- [ ] Set the same keys in the EAS env per build profile (`apps/mobile/eas.json`).

## 3. Apply Phase-2 migrations to prod (prod DB is at `0010`)

- [ ] `pnpm migrate:prod` (loads `infra/secrets.env`) → applies `0011` + `0012`.
  - Fallback if the pooler auth fails: Supabase MCP `apply_migration` per file, then INSERT the journal rows (`hash` = `shasum -a 256 <file>`, `created_at` from `_journal.json`: `0011`→`1782400000000`, `0012`→`1782500000000`).
- [ ] Verify: `get_advisors(security)` clean; `on_auth_identity_linked` trigger present on prod `auth.identities`; `handle_identity_linked` body contains `is_anonymous = true` (the `0012` guard).

## 4. Prereq from #50 (guest→OAuth upgrade depends on anon sign-in being live in prod)

- [ ] Confirm the prod GoTrue settings from #50 / Plan C2 are applied — at minimum the anon-signup IP rate-limit and `enable_anonymous_sign_ins = ON`. (Full list lives in #50; called out here because the Phase-2 upgrade flow can't be verified without it.)

## 5. Dev build + REAL-DEVICE verification (the part that actually proves it)

Native Google can't run in Expo Go — must be a custom dev build.

- [ ] `cd apps/mobile && eas build --profile development --platform android` → install the APK on the emulator/device.
- [ ] `pnpm --filter @autodidact/mobile start` (JS iteration stays on fast-refresh after this).
- [ ] **Sign-in (Phase 1):** "Continue with Google" → native sheet → lands in `(app)`; "Continue with Facebook" → in-app browser → `autodidact://auth-callback` → lands in `(app)`. Confirm a `public.users` row exists (trigger). "Use email instead" + "Continue as guest" still work. Cancelling either social flow returns cleanly (no crash).
- [ ] **Upgrade (Phase 2):** as a guest → "Continue with Google/Facebook" on the profile `UpgradeAccountCard` → **same UUID preserved**, `public.users.is_anonymous = false`, **progress retained**, email populated. (Exercises `linkIdentity`→`exchangeCodeForSession` PKCE + the `0011`/`0012` trigger for real.)
- [ ] Optional: add a `.maestro/` flow for regression.

## 6. Close-out bookkeeping

- [ ] Tick the checkboxes in the Phase-1 and Phase-2 plan files and add a `> Completed: <date>` marker.
- [ ] `git mv` the Phase-1 plan, Phase-2 plan, and the social-sign-in spec → `docs/superpowers/.../​_done/`; update the subfolder `README.md` indexes. (Coordinate with any session restructuring those folders.)
- [ ] Delete `note-to-self.md` once the above is green.
- [ ] Close parent **#51** (and this sub-issue) — the hook closes on the `_done/` move; otherwise `gh issue close 51 -c "Social sign-in shipped + verified on device."`.
