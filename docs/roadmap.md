# Roadmap

## Phase 1 — MVP (current)
- [x] Monorepo scaffold
- [x] Shared packages (types, schemas, db, providers, prompts, observability)
- [x] Database schema + migrations + RLS
- [x] Agent service (course generation graph, module chat graph)
- [x] Worker service (async course generation, embeddings)
- [x] API service (auth, courses, chat SSE, progress)
- [x] Mobile app (home, course list, course detail, module chat)
- [x] Infrastructure (Terraform, Cloud Run, Cloud Tasks)
- [x] CI/CD (GitHub Actions)

## Phase 1.5 — Deploy & operate (MVP hardening)

> Bridge from "code-complete + CI-green" to "deployable + operable". Per-deployable
> status lives in the root `PRODUCTION.md`.

- [x] Fix Terraform/code secret-name drift — `main.tf` now injects `SUPABASE_SECRET_KEY` (matching the code); dropped the unread `SUPABASE_JWT_SECRET` / `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Flip `CHECKPOINTER=postgres` (currently in-memory default) and verify
- [ ] Worker failed-job recovery so stuck courses aren't unrecoverable
- [ ] Wire error tracking / OTEL backend
- [ ] API rate limiting
- [ ] LLM cost/token controls in the Agent
- [ ] EAS build + store-submission path for Mobile — *build config done (`apps/mobile/eas.json`, 3 profiles); Play Store submission pending*
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
- [ ] Populate Secret Manager with real values (see `docs/todo.md` → ENV setup)
- [ ] Google Play Developer account for Android beta submission
- [ ] Run the actual deploy + smoke test against real infra
- [ ] Configure Google + Facebook OAuth providers (Supabase dashboard; Google Cloud Web client + dev/prod Android SHA-1 client IDs; Facebook app) — unblocks social sign-in
- [ ] Apply auth migrations `0011`/`0012` to prod + enable manual-linking + GoTrue hardening (prod DB is at `0010`)

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
