# note-to-self — finish auth tomorrow

> Personal checklist. Delete this file once auth is fully shipped. All the code is on `master`;
> what's left is **owner-gated config + real-device verification + prod migration apply**.
> None of the OAuth/upgrade flows have ever run for real — they're unit-verified against mocks
> only. The real-device pass is the actual proving ground; treat it as required, not polish.

---

## Where things stand (so tomorrow-me has context)

| Piece | Code | Local | **Prod** |
|---|---|---|---|
| Plan C1/C2 — Data-API lockdown + policy hardening (`0009`/`0010`) | merged | applied | ✅ applied (advisors clear) |
| Plan C2 — **GoTrue dashboard settings** (confirmation, password/HIBP, MFA TOTP, rate-limits, anon ON) | n/a (dashboard) | local config.toml done | ❌ **NOT done** |
| Social Sign-In **Phase 1** (Google native + FB web sign-in) | merged | code-only | ❌ providers not configured |
| Social Sign-In **Phase 2** (guest→OAuth upgrade, `0011`+`0012` triggers, manual-linking) | merged | `0011`+`0012` applied; `enable_manual_linking=true` | ❌ migrations + manual-linking + providers NOT done |

**Prod DB migration cursor:** prod is at `0010`. **`0011` + `0012` are NOT on prod yet.**

---

## Do this tomorrow, in order

### 1. Provider + dashboard setup (Supabase + Google Cloud + Facebook) — the unblocker
Everything below is blocked until the OAuth providers exist.

- [ ] **Supabase dashboard** (project `cbzdsoojfhpsexuyeyxt`) → Authentication → Providers: enable **Google** and **Facebook** (client IDs + secrets).
- [ ] Add `autodidact://auth-callback` to the **Redirect URLs** allow-list.
- [ ] Enable **Manual linking** (Auth settings) — required for the Phase-2 guest→OAuth upgrade (`linkIdentity`).
- [ ] **Google Cloud Console** OAuth clients:
  - one **Web** client → its ID goes in `GOOGLE_WEB_CLIENT_ID` (`.env.dev`) **and** the Supabase Google provider.
  - **TWO Android** clients (this is the easy-to-miss one): one bound to the **EAS dev-build** signing SHA-1, one to the **prod** key SHA-1. Get both: `cd apps/mobile && eas credentials` (Android → keystore). *Forgetting the prod Android client = "Google works in dev, breaks in prod."*
- [ ] **Facebook** app: add Android platform + key hashes, set the OAuth redirect to the Supabase callback.
- [ ] Set `GOOGLE_WEB_CLIENT_ID` and `FACEBOOK_ENABLED=true` in `.env.dev` (and the EAS env per profile).
- [ ] Full runbook: `apps/mobile/docs/social-sign-in.md`.

### 2. Apply Phase-2 migrations to prod
- [ ] `pnpm migrate:prod` (loads `infra/secrets.env`) → applies `0011` + `0012` to prod.
  - Fallback if the pooler auth fails: Supabase MCP `apply_migration` for each, then INSERT the journal rows (`hash` = `shasum -a 256 <file>`, `created_at` = the `_journal.json` `when`: `0011`→`1782400000000`, `0012`→`1782500000000`). (Same pattern Plan C used.)
- [ ] Verify: `get_advisors(security)` clean; `on_auth_identity_linked` trigger present on prod `auth.identities`; `handle_identity_linked` function body contains `is_anonymous = true` (the `0012` guard).

### 3. Plan C2 — apply the prod GoTrue settings (still outstanding from Plan C)
Dashboard / Management API for `cbzdsoojfhpsexuyeyxt`, **rate-limits first, then anon ON**:
- [ ] Anonymous-signup **IP rate-limit** (e.g. ~30/hr/IP) — confirm live **first**.
- [ ] Email **confirmation ON**; **password** min-8 + strength; **leaked-password (HIBP)** protection.
- [ ] **MFA TOTP** enroll + verify enabled.
- [ ] **Redirect allow-list** (`autodidact://`, app URLs).
- [ ] **Then** flip `enable_anonymous_sign_ins = ON` (B1's prod release was gated on this).

### 4. Build the dev client + REAL-DEVICE verification (the part that actually proves it)
Native Google can't run in Expo Go — must be a custom dev build.
- [ ] `cd apps/mobile && eas build --profile development --platform android` → install the APK on the emulator.
- [ ] `pnpm --filter @autodidact/mobile start` (JS iteration stays on fast-refresh after this).
- [ ] **Sign-in (Phase 1):** "Continue with Google" → native sheet → lands in `(app)`; "Continue with Facebook" → in-app browser → `autodidact://auth-callback` → lands in `(app)`. Confirm a `public.users` row exists (trigger). "Use email instead" + "Continue as guest" still work. Cancelling either social flow returns cleanly (no crash).
- [ ] **Upgrade (Phase 2):** as a guest → "Continue with Google/Facebook" on the profile `UpgradeAccountCard` → **same UUID preserved**, `public.users.is_anonymous=false`, **progress retained**, email populated. This is the one that exercises the `linkIdentity`→`exchangeCodeForSession` PKCE flow + the `0011`/`0012` trigger for real.
- [ ] Optional: `.maestro/` flow for regression.

### 5. Bookkeeping + loose ends
- [ ] Move completed plans/specs to `_done/` per the new `docs/superpowers` convention (status = subfolder): `git mv` the Phase-1 plan, Phase-2 plan, Plan C1/C2 plans (once C2 done) + the social-sign-in spec → `_done/`, add `> Completed: <date>`, update the subfolder `README.md` indexes. **Coordinate with the other session that was restructuring those folders** — don't clobber its README edits.
- [ ] Spec 4 **DEV_AUTO_LOGIN** is still unbuilt (`app/_layout.tsx` has the slot stubbed). Spec 3 onboarding is the other session's in-progress plan — coordinate.

---

## Risks / things I'm NOT sure about (verify, don't assume)
- **Everything OAuth is mock-verified only.** The supabase-js `linkIdentity`→`exchangeCodeForSession` **contract** was type-verified (it's the PKCE OAuthResponse flow — correct), and the Google v16 response shape was checked against the installed `.d.ts`. But no flow has executed end-to-end. Step 4 is where a wrong assumption would finally surface.
- **PKCE verifier persistence:** the FB/link flows depend on the SecureStore adapter on the supabase client (`src/lib/supabase.ts`, `flowType:'pkce'`). If a link silently fails mid-handshake, suspect this.
- If `linkIdentity` errors with "manual linking disabled" → step 1's manual-linking toggle wasn't applied (local config.toml is set; **prod dashboard is separate**).
