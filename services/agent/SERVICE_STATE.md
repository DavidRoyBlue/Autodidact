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

- Three routes implemented: `POST /course/generate`, `POST /module-chat/stream` (SSE), `POST /embeddings/text`, plus `/health`.
- LLM access through `ILLMProvider.getModel()` — OpenAI (default) and Anthropic both implemented and switchable via `LLM_PROVIDER`.
- Completion detection: teacher emits `[MODULE_COMPLETE:score=N]`, stripped before reaching the client, routes to evaluator.
- 4 test files (course-gen nodes, module-chat nodes, both routes). Green in CI.

## Infrastructure

- API (HTTP): ✅ Fastify, Dockerfile + Cloud Run module (internal, `allow_public=false`)
- Database: ⚠️ used only by the Postgres checkpointer (prod); not active in dev default
- Auth: ➖ none (internal service; relies on network isolation)
- LLM: ✅ OpenAI + Anthropic implemented
- Embeddings: ⚠️ OpenAI implemented; Cohere provider exists but is an explicit stub
- Checkpointer: ⚠️ defaults to in-memory; Postgres implemented but unverified in prod
- Error Tracking: ❌ none wired

## Current Bottleneck

`CHECKPOINTER` defaults to `memory`: conversation state lives in process memory and is lost on restart, and cannot scale past one instance. Production requires `CHECKPOINTER=postgres` (via the `autodidact-checkpointer` secret) — this path is implemented but has not been validated end-to-end.

## Known Issues

- In-memory checkpointer in any multi-instance or restart scenario silently drops chat history.
- No cost controls / token budgets on LLM calls — unbounded spend risk under load.
- Internal-only guarantee depends entirely on Cloud Run ingress config (`allow_public=false`); no app-level auth as a backstop.
- Doc drift: agent `README.md` / API `README.md` say `/generate-course`; the real route is `/course/generate`.

## Next Steps

1. Verify `CHECKPOINTER=postgres` end-to-end (migrations, connection, multi-turn replay).
2. Add per-request LLM token/cost limits and timeouts.
3. Wire error tracking (OTEL endpoint or equivalent) for failed graph runs.
4. Fix the route-name drift in the READMEs.

## Open Questions

- What is the acceptable monthly LLM spend ceiling, and how is it enforced?
- Should the agent enforce a shared-secret header from API/Worker in addition to network isolation?

## Confidence

- Developers: ✅ — graphs and routes are clean, well-tested, well-documented.
- Internal testers: ⚠️ — works with a real `OPENAI_API_KEY`; memory checkpointer fine for single-session testing.
- Beta users: ⚠️ — needs Postgres checkpointer validated and cost controls.
- Production users: ❌ — unbounded cost + unverified persistence block it.
