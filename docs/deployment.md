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
| Mobile in the **dev client** on the Windows-host emulator | `pnpm mobile:run` (or `pnpm mobile` for Metro only) | ✅ verified 2026-07-19 |
| First-time setup | `pnpm setup` | ✅ |

`pnpm mobile:run` boots the AVD (`Medium_Phone`), requires the dev client on the device
(fail-fast with build/install instructions otherwise), starts Metro, and opens the project in
the dev client. The device reaches Metro (8081), the api (3000) and local Supabase (55321) via
the **`10.0.2.2` host loopback** — NOT `adb reverse`, whose tunnels silently pass no data
across the Windows-adb-server/WSL split. Metro is started with `SUPABASE_URL` /
`AUTODIDACT_API_BASE_URL` pointing at `10.0.2.2`; backend keeps the `127.0.0.1` values.

**Expo Go cannot run this app** (native Google sign-in crashes it on boot with
`'RNGoogleSignin' could not be found`) — the dev client is the only dev path.

## 2. Mobile dev client (custom dev build)

A dev client is a custom APK containing the app's native modules + `expo-dev-client`; JS still
comes from Metro, so the daily loop is unchanged once it's installed. Required for any native
module — today that's Google sign-in. Full auth setup: [`apps/mobile/docs/social-sign-in.md`](../apps/mobile/docs/social-sign-in.md).

**Current status: ✅ built and installed on the AVD (2026-07-19).** First green EAS build:
`d8fbfd24` (development profile). Keystore SHA-1
`E5:1A:B1:0B:A9:5E:44:79:7C:1B:2E:D1:E5:3F:EB:F7:B4:7C:AF:45` (matches the Android OAuth client
in Google Cloud Console). To rebuild:

```bash
cd apps/mobile
npx eas-cli build --profile development --platform android   # cloud build
# download the APK from the printed URL, then:
adb install -r <apk>                                         # onto the emulator
pnpm mobile:run                                              # opens the project in the dev client
```

**Rebuild triggers:** changes to `app.json`/`app.config.ts` plugins or native config
(package, scheme, splash/icon), the committed assets themselves, or any dependency with native
code. Pure JS/TS iterates via Metro, no rebuild.

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
| `preview` | internal APK | Cloud Run prod | ✅ green (`37a8f470`, 2026-07-19) — do **not** install on the dev AVD (same package name replaces the dev client) |
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

- Local Metro (`pnpm mobile:run`): local Supabase stack + local API, exposed to the device as
  `10.0.2.2` (the script overrides `SUPABASE_URL`/`AUTODIDACT_API_BASE_URL` for Metro only —
  `.env.dev` keeps `127.0.0.1` for the backend). ✅
- EAS `preview`/`production`: Cloud Run API via profile env; Supabase falls back to the **hosted**
  project baked in `app.json`. ✅ (intended)
- EAS `development` **installed APK launched without Metro**: localhost API + hosted Supabase
  fallback — mixed targets, but irrelevant in practice because a dev client is always driven by
  Metro, which re-resolves from `.env.dev`. ⚠️ just don't treat a standalone-launched dev client
  as a working app.
