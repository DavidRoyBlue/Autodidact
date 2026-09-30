# Roadmap

## Phase 1 — MVP (current)
- [x] Monorepo scaffold
- [x] Shared packages (types, schemas, db, providers, observability)
- [x] Database schema + migrations + RLS
- [x] Agent service (course generation graph, module chat graph — both since moved to AgentPlatform, ADR-030/ADR-031; the service is embeddings-only now)
- [x] Worker service (async course generation, embeddings)
- [x] API service (auth, courses, chat SSE, progress)
- [x] Mobile app (home, course list, course detail, module chat)
- [x] Infrastructure (Terraform, Cloud Run, Cloud Tasks)
- [x] CI/CD (GitHub Actions)

## Phase 1.5 — Deploy & operate (MVP hardening)

> Bridge from "code-complete + CI-green" to "deployable + operable". Per-deployable
> status lives in the root `PRODUCTION.md`.

- [x] Fix Terraform/code secret-name drift — `main.tf` now injects `SUPABASE_SECRET_KEY` (matching the code); dropped the unread `SUPABASE_JWT_SECRET` / `SUPABASE_SERVICE_ROLE_KEY`
- [x] ~~Flip `CHECKPOINTER=postgres`~~ — moot: ADR-031 moved the module teacher to AgentPlatform, which owns thread history now; the checkpointer provider is unused
- [x] Drop `LLM_PROVIDER`/`CHECKPOINTER` from `infra/` (ADR-031 follow-up) — removed from `infra/environments/prod/main.tf` and `scripts/gcp-bootstrap.sh`; nothing in the codebase reads either env var (#322)
- [x] Fix `0013_onboarding` silently skipped everywhere (#320): journal entry moved last with a `when` past the max; guarded by `journal.test.ts`
- [x] Catch-up prod deploy runbook (#320) — `docs/gcp_infra_setup.md` §9; decisions in `docs/decisions.md`. Execution is owner-only (below); waits on #321
- [ ] Worker failed-job recovery so stuck courses aren't unrecoverable
- [ ] Wire error tracking / OTEL backend
- [ ] API rate limiting
- [ ] LLM cost/token controls in the Agent
- [x] Mobile runs on the emulator again (#320 follow-up): `scripts/run-mobile.sh --release` builds the APK locally (Accountability's recipe) and installs it — no EAS dev client, no Metro; walkthrough in `apps/mobile/docs/walkthrough-2026-09-29.md` — its "Left open" list (chat session resume, server-side enroll on generation, Google end-to-end, streaming UX, generation failures on long budgets) is what remains
- [ ] EAS build + store-submission path for Mobile — *build config done (`apps/mobile/eas.json`, preview/production profiles); Play Store submission pending*
- [ ] Real Mobile test coverage (E2E, not just light unit tests)

### Auth & mobile styling (since 2026-06)

> Detail + per-phase checklists: `docs/superpowers/` (specs + plans) and `note-to-self.md` (repo root). This is a status digest, not the source of truth.

- [x] Production auth — provisioning/identity triggers, anonymous sign-in, stale-anonymous cleanup, Data-API lockdown + RLS policy hardening live on prod (Spec 2 Phases 0–2; migrations `0006`–`0009`)
- [x] Mobile styling — Tamagui → NativeWind v4 migration shipped, light + dark themes (PR #37)
- [ ] Production auth Phase 3 — policy migration `0010` applied to prod; **owner-gated**: GoTrue dashboard hardening (email confirmation, HIBP, TOTP MFA, anon rate-limit) + flip anonymous sign-in ON in prod
- [ ] Social sign-in (Google + Facebook) — OAuth sign-in + guest→OAuth upgrade code merged to `master`; **owner-gated**: provider config + prod migrations `0011`/`0012` + real-device verification

## Owner-only — decisions & credentials (David)

> No agent can complete these: they need product calls, real accounts, secrets,
> or money. They gate Phase 1.5.

### Decisions to make
- [x] Deployment environment: `master` deploys straight to prod via `deploy.yml`; defer staging until beta traffic or release risk justifies a second environment
- [x] LLM spend ceiling: leave uncapped for initial MVP validation; revisit once real beta usage gives cost data
- [x] First beta target: Android via Expo/EAS, distributed through Google Play
- [x]  Cloud Tasks for prod job durability 

### Credentials & provisioning to do
- [ ] Google Play Developer account for Android beta submission
- [ ] Configure Google + Facebook OAuth providers (Supabase dashboard; Google Cloud Web client + dev/prod Android SHA-1 client IDs; Facebook app) — unblocks social sign-in
- [ ] Enable manual-linking + GoTrue hardening in the Supabase dashboard (goes with the `0011`/`0012` auth migrations below)

### Catch-up prod deploy (#320) — run `docs/gcp_infra_setup.md` §9 in order
Prod last deployed 2026-06-26; DB at `0010`; Supabase project paused. Secret Manager already holds the June values — §9.2 only adds what `main.tf` gained since.
- [ ] §9.0 now: restore Supabase project `cbzdsoojfhpsexuyeyxt`, confirm pooler URL, connectivity check, early `pg_dump`
- [ ] §9.1 gate: #321 merged to `master`, CI green, `origin/production..origin/master` reviewed
- [ ] §9.2 secrets: new `main.tf` env vars → `infra/secrets.env` → `scripts/gcp-bootstrap.sh` (skip if none)
- [ ] §9.3 `terraform plan` matches the enumerated diff → `terraform apply`
- [ ] §9.4 `pg_dump` to `~/backups`, row counts recorded
- [ ] §9.5 `pnpm migrate:prod` → journal at 15 rows (`0011`, `0012`, `0014`, `0015`, `0013`), no `blueprint`, no null `modules.content`
- [ ] §9.6 `git push origin origin/master:production`, watch the Deploy run
- [ ] §9.7 `/v1/health` all `ok`, onboarding course seeded, row counts match; tick here and bump `PRODUCTION.md` Infra `_verified:`

## Phase 2 — Polish
- [ ] Course generation progress indicator (WebSocket or SSE to mobile during generation)
- [ ] Module completion animations
- [ ] Course search / browse public courses
- [ ] Push notifications for completion streaks
- [ ] Offline support for previously loaded modules

## Phase 3 — Scale
- [ ] Add Anthropic as alternative LLM provider (one env var change)
- [ ] Add Cohere embeddings provider
- [ ] Web app (`apps/web`) using same API
- [ ] Admin panel for course moderation
- [ ] RAG integration for domain-specific knowledge via pgvector

## Phase 4 — Community
- [ ] User-created courses
- [ ] Course ratings and reviews
- [ ] Learning streaks and leaderboards
- [ ] Course sharing via deep links
