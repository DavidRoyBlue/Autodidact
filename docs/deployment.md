# Deployment & Run Runbook

How to run and ship Autodidact — dev and prod, backend and mobile. Reference detail lives in
[`gcp_infra_setup.md`](gcp_infra_setup.md) (GCP/Terraform) and
[`apps/mobile/AGENTS.md`](../apps/mobile/AGENTS.md) (EAS invariants); this file is the operator view.

**Status legend:** ✅ wired and verified · ⚠️ wired but unverified · ❌ needs wiring

---

## 1. Local dev (daily loop)

| What | Command | Status |
|---|---|---|
| Backend stack (Supabase + api/agent/worker) | `pnpm dev` | ✅ |
| Mobile APK on the Windows-host emulator | `pnpm mobile:run -- --release` (`pnpm mobile` = Metro for a debug APK) | ✅ verified 2026-09-29 |
| First-time setup | `pnpm setup` | ✅ |

`pnpm mobile:run -- --release` boots the AVD (`Medium_Phone`), builds the APK in WSL
(`expo prebuild` + gradle) and installs it. The device reaches the api (3000) and local Supabase
(55321) via the **`10.0.2.2` host loopback**, baked into the APK — NOT `adb reverse`. **Expo Go
cannot run this app** (native Google sign-in crashes it at import); the EAS `development` profile
is a cloud dev client, not the dev path. Details: `scripts/run-mobile.sh` header and the
`run-mobile` skill; auth setup: [`apps/mobile/docs/social-sign-in.md`](../apps/mobile/docs/social-sign-in.md).

Hard-won build fixes (all committed — don't undo):
- Placeholder assets in `apps/mobile/assets/` — missing assets killed every earlier build in prebuild
- Kotlin 1.9.25 pin via `expo-build-properties` in `app.config.ts` (Compose Compiler 1.5.15 rejects 1.9.24)
- `apps/mobile/react-native.config.js` pins expo's `packageImportPath` (pnpm monorepo autolinking
  emits uncompilable `expo.core` otherwise)
- `expo-asset` as a direct dep (release bundling can't resolve it transitively under pnpm)

Auth against the local stack (verified on device 2026-07-19): guest sign-in ✅ ·
guest→email upgrade ✅ · Google native sheet opens with a valid client (no `DEVELOPER_ERROR`) ⚠️
full Google token exchange pending a Google account signed into the AVD (one-time per AVD;
see [social-sign-in.md](../apps/mobile/docs/social-sign-in.md) local-stack section).

## 3. Prod backend (GCP)

- **Deploy = promote:** `git push origin master:production` → `.github/workflows/deploy.yml`
  (lint/typecheck/test → build & push 3 images → migrate prod DB → seed onboarding course →
  `gcloud run deploy` ×3, via Workload Identity Federation). Pushing to `master` alone does not deploy.
- **Status: ✅ live** — Cloud Run ×3 in `autodidact-494819` / `northamerica-northeast1`;
  API at `https://autodidact-api-3tynnutnpq-nn.a.run.app`.
- Secrets: `infra/secrets.env` → Secret Manager (never committed; no `.env.prod`).
- Manual DB ops (sparingly): `pnpm migrate:prod`, `pnpm db:studio:prod`.
- Runbook & bootstrap: [`gcp_infra_setup.md`](gcp_infra_setup.md).

## 4. Prod / preview mobile builds (EAS → Google Play)

| Profile | Artifact | API target | Status |
|---|---|---|---|
| `preview` | internal APK | Cloud Run prod | ✅ green (`37a8f470`, 2026-07-19) — `run-mobile.sh` replaces it on the dev AVD (different keystore) |
| `production` | signed `.aab` (auto-increment versionCode) | Cloud Run prod | ⚠️ unbuilt since the fixes; shares the whole pipeline with `preview`, so expected green |

```bash
cd apps/mobile
eas build --profile preview    --platform android   # installable APK against prod backend
eas build --profile production --platform android   # .aab for the Play Console
eas submit --profile production --platform android   # needs a Play service-account key (not set up)
```

Play Console listing + service-account key for `eas submit` are not set up yet.

---

## Environment wiring summary

`app.config.ts` resolves `extra.*` at Metro/build time: build-profile env (`eas.json`) →
`.env.dev` (local Metro) → `app.json` fallbacks. Consequences:

- Local APK (`pnpm mobile:run`): local Supabase stack + local API, exposed to the device as
  `10.0.2.2` (the script exports `SUPABASE_URL`/`AUTODIDACT_API_BASE_URL` for the build only —
  `.env.dev` keeps `127.0.0.1` for the backend). ✅
- EAS `preview`/`production`: Cloud Run API via profile env; Supabase falls back to the **hosted**
  project baked in `app.json`. ✅ (intended)
- EAS `development`: cloud dev client, localhost API + hosted Supabase fallback — not used for local runs.
