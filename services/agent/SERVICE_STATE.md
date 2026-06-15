# Service State: Agent

> Internal AI runtime (Fastify + LangGraph). Never public. Port 3001.
> Pair docs: [`README.md`](./README.md) · [`CLAUDE.md`](./CLAUDE.md)

## Purpose

Runs all LLM and embedding calls. Two LangGraph graphs: course-generation (blueprint JSON, retries 3×) and module-chat (teacher + evaluator nodes, checkpointed, streamed via SSE). Generates topic embeddings for similarity reuse. Called only by API and Worker.

## Status

- Dev Ready: ✅
- Beta Ready: ⚠️
- Production Ready: ❌

## Current State

- Five routes implemented: `POST /course/generate`, `POST /module-chat/stream` (SSE), `POST /embeddings/text`, `GET /health` (liveness), `GET /ready` (readiness — pings the checkpoint store).
- LLM access through `ILLMProvider.getModel()` — OpenAI (default) and Anthropic both implemented and switchable via `LLM_PROVIDER`.
- All node LLM calls go through `invokeModel()` (`src/llm/resilient-invoke.ts`): per-attempt timeout, bounded backoff retry on 429/5xx/network errors, caller cancellation via `AbortSignal`, and token-usage span attributes.
- RAG grounding (ADR-024, gated by `RAG_ENABLED`): the teacher node retrieves top-k `module_content_chunks` via `PgVectorContentRetriever` (`src/rag/retriever.ts`) and grounds its prompt — best-effort, falls back to the un-grounded prompt on failure.
- Completion detection: teacher emits `[MODULE_COMPLETE:score=N]`, stripped before reaching the client, routes to evaluator.
- 12 test files (course-gen/module-chat nodes + graph, all routes incl. health, RAG teacher, resilient-invoke, eval-scorers, instrumentation, errors). Green in CI.

## Infrastructure

- API (HTTP): ✅ Fastify, Dockerfile + Cloud Run module (internal, `allow_public=false`)
- Database: ⚠️ Postgres checkpointer (prod) + RAG retriever reads `module_content_chunks` when `RAG_ENABLED`; otherwise not active in dev default
- Auth: ➖ none (internal service; relies on network isolation)
- LLM: ✅ OpenAI + Anthropic implemented
- Embeddings: ⚠️ OpenAI implemented; Cohere provider exists but is an explicit stub
- Checkpointer: ⚠️ defaults to in-memory; Postgres implemented but unverified in prod
- Error Tracking: ❌ none wired

## Current Bottleneck

`CHECKPOINTER` defaults to `memory`: conversation state lives in process memory and is lost on restart, and cannot scale past one instance. Production requires `CHECKPOINTER=postgres` (via the `autodidact-checkpointer` secret) — this path is implemented but has not been validated end-to-end.

## Known Issues

- In-memory checkpointer in any multi-instance or restart scenario silently drops chat history.
- No token/cost *budget* enforcement on LLM calls. Per-attempt timeouts and retry caps exist (via `invokeModel()`), but nothing caps cumulative spend, so cost is unbounded under sustained load.
- Internal-only guarantee depends entirely on Cloud Run ingress config (`allow_public=false`); no app-level auth as a backstop.

## Next Steps

1. Verify `CHECKPOINTER=postgres` end-to-end (migrations, connection, multi-turn replay).
2. Add per-request LLM token/cost budget limits (per-attempt timeouts already exist via `invokeModel()`).
3. Wire error tracking (OTEL endpoint or equivalent) for failed graph runs.

## Open Questions

- What is the acceptable monthly LLM spend ceiling, and how is it enforced?
- Should the agent enforce a shared-secret header from API/Worker in addition to network isolation?

## Confidence

- Developers: ✅ — graphs and routes are clean, well-tested, well-documented.
- Internal testers: ⚠️ — works with a real `OPENAI_API_KEY`; memory checkpointer fine for single-session testing.
- Beta users: ⚠️ — needs Postgres checkpointer validated and cost controls.
- Production users: ❌ — unbounded cost + unverified persistence block it.
