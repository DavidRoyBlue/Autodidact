# Project State

> Save file for Autodidact. Per-service detail lives in each `SERVICE_STATE.md`
> (linked below). For *why* things are built this way, see `docs/` and the ADRs.

## Vision

An AI-native learning platform: generate a structured course from any topic, then learn it one module at a time through a guided AI-tutor chat, with completion tracking and semantic reuse of previously generated courses. Mobile-first, provider-agnostic backend.

## Current State

MVP is **code-complete and CI-green** — three backend services, a mobile app, and nine shared packages are all really implemented (not scaffolding), with lint + typecheck + tests running on every PR and before deploy. Feature scope includes RAG-grounded module chat (ADR-024): the Worker indexes module content into `module_content_chunks`, and the Agent's teacher node retrieves it when `RAG_ENABLED`. What it is **not** yet is *operated*: there is no evidence the stack has run end-to-end against provisioned cloud infrastructure. Environment/secret setup is still open (`docs/todo.md`), Terraform provisions secret names the code does not read, the agent's conversation checkpointer still defaults to in-memory, and no observability or error-tracking backend is wired. The gap is squarely between "builds and passes tests" and "deployable and operable."

## Services

| Service | Dev | Beta | Prod | Main Bottleneck |
|---------|-----|------|------|-----------------|
| [Mobile](apps/mobile/SERVICE_STATE.md) | ✅ | ⚠️ | ❌ | No build/release pipeline; e2e is manual-only (Maestro), not PR-gated |
| [API](services/api/SERVICE_STATE.md) | ✅ | ⚠️ | ❌ | Infra secret-name drift; no monitoring |
| [Agent](services/agent/SERVICE_STATE.md) | ✅ | ⚠️ | ❌ | Checkpointer defaults to memory; no cost controls |
| [Worker](services/worker/SERVICE_STATE.md) | ✅ | ⚠️ | ❌ | No failed-job recovery (stuck courses) |

Provider wiring today: each axis has exactly one real production implementation. `LLM_PROVIDER` (openai/anthropic) and `CHECKPOINTER` (memory/postgres) are the only axes with two live options. `EMBEDDING_PROVIDER` and `AUTH_PROVIDER` are read by their factories but offer only a `mock` test variant beside the single real impl (OpenAI, Supabase); unrecognized values fall through to the default. `QUEUE_PROVIDER` is not read at all — BullMQ is hardcoded. The Cohere embedding provider is an explicit stub (throws, not wired into the factory).

## Current Bottleneck

**The system has never been validated end-to-end against real infrastructure.** Concretely: env/secrets aren't set up (`docs/todo.md`), and there is drift between what `infra/environments/prod/main.tf` provisions (`SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) and what the code actually reads (JWKS via `SUPABASE_URL`, plus `SUPABASE_SECRET_KEY`). A real deploy would fail on this mismatch before any user-facing testing could begin.

## Progression Path

1. **Provision + reconcile environment** — fix the Terraform/code secret drift, set Secret Manager values, run one full deploy + smoke test against staging/prod.
2. **Make it durable for real sessions** — flip `CHECKPOINTER=postgres` and verify it; add Worker failed-job recovery so stuck courses aren't unrecoverable.
3. **Make it observable + safe to expose** — wire error tracking / OTEL backend, add API rate limiting, and add LLM cost/token controls in the Agent.
4. **Ship the client** — add an EAS build + store-submission path and real test coverage for Mobile.

## Current Objective

Stand up one working end-to-end environment: reconcile the secret-name drift, provision env/secrets, and prove a single course-generate → embed → chat flow works against deployed infrastructure. Everything else (monitoring, rate limits, builds) follows from having a validated deploy to harden.

## Open Questions

- Is there a staging environment, or does `master` deploy straight to production (current `deploy.yml`)?
- What is the acceptable LLM spend ceiling, and how is it enforced?
- First beta target: iOS, Android, or both — and via which distribution channel?
- BullMQ/Memorystore vs. Cloud Tasks for production job durability (ADR-007 🚩)?
