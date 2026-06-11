# Roadmap

## Phase 1 — MVP (current)
- [x] Monorepo scaffold
- [x] Shared packages (types, schemas, db, providers, prompts, observability)
- [x] Database schema + migrations + RLS
- [x] Agent service (course generation graph, module chat graph)
- [x] Worker service (async course generation, embeddings)
- [x] API service (auth, courses, chat SSE, progress)
- [x] Mobile app (home, course list, course detail, module chat)
- [x] Infrastructure (Terraform, Cloud Run, Memorystore)
- [x] CI/CD (GitHub Actions)

## Phase 1.5 — Deploy & operate (MVP hardening)

> Bridge from "code-complete + CI-green" to "deployable + operable". The stack
> has never run end-to-end against real infra. See `PROJECT_STATE.md`.

- [ ] Fix Terraform/code secret-name drift — `infra/environments/prod/main.tf` provisions `SUPABASE_JWT_SECRET` / `SUPABASE_SERVICE_ROLE_KEY`, but code reads JWKS via `SUPABASE_URL` + `SUPABASE_SECRET_KEY`
- [ ] Flip `CHECKPOINTER=postgres` (currently in-memory default) and verify
- [ ] Worker failed-job recovery so stuck courses aren't unrecoverable
- [ ] Wire error tracking / OTEL backend
- [ ] API rate limiting
- [ ] LLM cost/token controls in the Agent
- [ ] EAS build + store-submission path for Mobile
- [ ] Real Mobile test coverage (E2E, not just light unit tests)

## Owner-only — decisions & credentials (David)

> No agent can complete these: they need product calls, real accounts, secrets,
> or money. They gate Phase 1.5.

### Decisions to make
- [ ] Staging environment, or does `master` deploy straight to prod (`deploy.yml`)?
- [ ] LLM spend ceiling, and how it's enforced
- [ ] First beta target: iOS, Android, or both — and which distribution channel
- [ ] BullMQ/Memorystore vs. Cloud Tasks for prod job durability (ADR-007 🚩)

### Credentials & provisioning to do
- [ ] Populate Secret Manager with real values (see `docs/todo.md` → ENV setup)
- [ ] Apple Developer / Google Play accounts for store submission
- [ ] Run the actual deploy + smoke test against real infra

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
