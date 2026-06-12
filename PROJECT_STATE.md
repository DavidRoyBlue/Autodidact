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
