# Project State

> Each thing that must work for the app to run, with its state; one line under it.
> Detail per service in each `SERVICE_STATE.md`; *why* in `docs/` + ADRs.

**Legend:** 🔵 prod-ready · 🟢 runs in dev · 🔴 non-functional

🟢 **📱 Mobile** — Expo app, the only UI · [detail](apps/mobile/SERVICE_STATE.md)
Runs on the emulator; no build/release pipeline yet.

🟢 **🌐 API** — NestJS public HTTP: auth, courses, chat proxy · [detail](services/api/SERVICE_STATE.md)
Dev-green; infra secret-name drift and no monitoring remain.

🟢 **🧠 Agent** — Fastify + LangGraph, all LLM/embedding calls · [detail](services/agent/SERVICE_STATE.md)
Dev-green; checkpointer defaults to in-memory, no cost cap.

🟢 **⚙️ Worker** — BullMQ course-generation + embedding jobs · [detail](services/worker/SERVICE_STATE.md)
Dev-green; no stuck-job recovery.

🟢 **🗄️ Postgres + pgvector** — data store & RAG index (`packages/db`)
Working; schema, migrations, and pgvector all verified.

🟢 **🧰 Redis** — BullMQ queue / cache backend
Working (local Docker).

🔴 **📊 Observability** — pino + OTEL (`packages/observability`)
Wired but inactive; no OTEL endpoint/collector configured.

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
