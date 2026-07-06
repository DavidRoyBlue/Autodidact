# Project State

> Each thing that must work for the app to run, with its state; one line under it.
> Detail per service in each `SERVICE_STATE.md`; *why* in `docs/` + ADRs.

**Legend:** 🔵 prod-ready · 🟢 runs in dev · 🔴 non-functional

🟢 **📱 Mobile** — Expo app, the only UI · [detail](apps/mobile/SERVICE_STATE.md)
Runs on the emulator; EAS build profiles configured, no build shipped yet.

🟢 **🌐 API** — NestJS public HTTP: auth, courses, chat proxy · [detail](services/api/SERVICE_STATE.md)
Dev-green; no monitoring yet, never deployed to real infra.

🟢 **🧠 Agent** — Fastify + LangGraph, all LLM/embedding calls · [detail](services/agent/SERVICE_STATE.md)
Dev-green; checkpointer defaults to in-memory, no cost cap.

🟢 **⚙️ Worker** — Fastify task handler (Cloud Tasks), course-generation + embedding · [detail](services/worker/SERVICE_STATE.md)
Dev-green; failed-generation recovery in place (ADR-027); no alerting.

🟢 **🗄️ Postgres + pgvector** — data store & RAG index (`packages/db`)
Working; schema, migrations, and pgvector all verified.

🟢 **📨 Background queue** — Cloud Tasks (prod) / in-process loopback (dev), no Redis (ADR-027)
Dev-green via loopback; Cloud Tasks path not yet exercised against real GCP.

🔴 **📊 Observability** — pino + OTEL (`packages/observability`)
Wired but inactive; no OTEL endpoint/collector configured.

## Current Bottleneck

**The system has never been validated end-to-end against real infrastructure** — it has only ever run in dev. GCP is not yet bootstrapped: no project, no Secret Manager values, no `terraform apply`. The Terraform/code secret-name drift is now resolved (`main.tf` injects `SUPABASE_SECRET_KEY`, matching `packages/env/src/schema.ts`). The next gate is running the bootstrap (`docs/gcp_infra_setup.md` + `scripts/gcp-bootstrap.sh`) on an operator machine that has `gcloud`/`terraform` and the real secret values.

## Progression Path

1. **Provision the environment** — run the GCP bootstrap (`scripts/gcp-bootstrap.sh` → `terraform apply` → push to deploy), then one full deploy + smoke test.
2. **Make it durable for real sessions** — flip `CHECKPOINTER=postgres` and verify it; add Worker failed-job recovery so stuck courses aren't unrecoverable.
3. **Make it observable + safe to expose** — wire error tracking / OTEL backend, add API rate limiting, and add LLM cost/token controls in the Agent.
4. **Ship the client** — produce/submit a signed EAS build (profiles configured) and real test coverage for Mobile.

## Current Objective

Stand up one working end-to-end environment: run the GCP bootstrap, provision env/secrets, and prove a single course-generate → embed → chat flow works against deployed infrastructure. Everything else (monitoring, rate limits, builds) follows from having a validated deploy to harden.

## Open Questions

- Is there a staging environment, or does `master` deploy straight to production (current `deploy.yml`)?
- What is the acceptable LLM spend ceiling, and how is it enforced?
- First beta target: iOS, Android, or both — and via which distribution channel?
