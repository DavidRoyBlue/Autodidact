# Subtree Instructions — services/agent/

> These rules apply only within `services/agent/`. They extend the root `AGENTS.md`.

## Purpose of this subtree

Internal AI runtime. Runs all LangGraph graphs. Handles all LLM and embedding interactions for the platform. Never exposed to the public internet. Called only by services/api and services/worker. Listens on `AGENT_PORT` (default 3001).

---

## Invariants (must not be broken)

- This service is INTERNAL ONLY — never expose port 3001 publicly.
- All LLM calls go through the `llmProvider` token (`ILLMProvider`) — never import `@langchain/openai`, `@langchain/anthropic`, or any LLM SDK directly in graph or route code. Use `llmProvider.getModel()`.
- Graphs own conversation logic; routes own HTTP transport — do not put graph state manipulation inside route handlers.
- The checkpointer strategy (in-memory vs PostgreSQL) is controlled by the `CHECKPOINTER` env var via `createCheckpointer({})` — do not hardcode `MemorySaver` in any code path that runs in production.
- `thread_id` in LangGraph `configurable` = `sessionId` from the request — this is the checkpoint key for conversation continuity. Changing the key breaks multi-turn history.
- The `[MODULE_COMPLETE:score=N]` marker is stripped from teacher node output before it reaches the client (see `nodes.ts`). Users must never see this marker. Do not change the regex or strip logic without testing the SSE event stream end-to-end.
- All node LLM calls go through `invokeModel()` (`src/llm/resilient-invoke.ts`) — never call `model.invoke()` directly in a node. It adds a per-attempt timeout, bounded backoff retry on transient errors (429/5xx/network), caller cancellation, and token-usage span attributes. Nodes receive the LangGraph `config` and forward `config.signal` so client disconnects cancel in-flight work.
- Never send raw error text to clients. SSE error events must be built with `toErrorEvent()` (`src/errors.ts`), which maps to a safe `{ type:'error', code, message }`. Log full error detail server-side via the `logger`. Do not reintroduce `String(error)`.

---

## Library / tooling rules

**Use:**
- Fastify (not Express, not NestJS)
- LangGraph (`@langchain/langgraph`) for all graph orchestration
- `@autodidact/providers` tokens (`ILLMProvider`, `IEmbeddingProvider`, `ICheckpointerProvider`) for all AI/infra providers
- `@autodidact/prompts` for all prompt templates — do not inline system prompts in node or route files
- `@autodidact/schemas` for output validation (e.g., `CourseBlueprintSchema`)
- Zod for request body validation in routes

**Do not use:**
- NestJS
- Direct `@langchain/openai` or `@langchain/anthropic` SDK imports in graph or route files
- `MemorySaver` imported directly outside of the providers package
- Inline system prompt strings in graph node files

---

## Source of truth

- SSE event protocol (token / module_complete / complete / error): `services/agent/src/routes/module-chat.ts`
- Course blueprint schema: `@autodidact/schemas` (`CourseBlueprintSchema`)
- LangGraph graph state shapes: graph `state.ts` files in `src/graphs/`
- Provider interfaces: `packages/providers/src/`

---

## Key patterns to follow

- **SSE streaming:** set `Content-Type: text/event-stream` and all required headers, then use `reply.raw.write()` for each event. Always call `reply.raw.end()` in the `finally` block — on completion and on error. Detect client disconnect (to cancel in-flight LLM work) on **`reply.raw.on('close')`**, never `request.raw` — on a POST route, `request.raw` ('close') fires the instant the request body is read, which would abort the stream before the first token.
- **Graph invocation for module chat:** always pass `{ configurable: { thread_id: sessionId } }` so LangGraph can load and persist the correct conversation checkpoint.
- **Request validation:** use Zod `parse()` or `safeParse()` in routes and return a structured 400 before the graph is invoked on invalid input.
- **Completion detection:** after streaming ends, call `graph.getState(config)` to read `completionSignaled` and emit a `module_complete` SSE event if true.
- **Node observability:** graph nodes are wrapped with `instrumentNode(name, fn, logger)` (`src/graphs/instrumentation.ts`) in the graph builders — it opens a `graph.node.<name>` span and logs latency + state signals. Pass the service `logger` into `buildModuleChatGraph`/`buildCourseGenerationGraph`. The wrapper preserves the registered node name, so the `langgraph_node` SSE filter is unaffected.
- **RAG grounding (ADR-024):** the teacher node accepts an optional `ContentRetriever` (`src/rag/retriever.ts`). When present (gated by `RAG_ENABLED`), it retrieves top-k `module_content_chunks` for the latest learner message and passes them to `buildModuleSystemPrompt` as a grounding block. Retrieval is best-effort — a failure falls back to the un-grounded prompt and never fails the turn. Retrieval needs `state.moduleBlueprint.id` (the API includes it in the payload). The agent reads `@autodidact/db` for this — the only place it touches application data.

---

## Anti-patterns to avoid

- Do not put LLM calls directly in route handlers.
- Do not hardcode model names — use `llmProvider.getModel()`.
- Do not swallow LangGraph errors silently — emit an `error` SSE event and let the `finally` block close the connection.
- Do not add a new graph node that writes to the same state keys as an existing node without considering checkpointer replay compatibility.

---

## Commands / workflows

```bash
pnpm dev                                    # start all services (monorepo root)
pnpm --filter @autodidact/agent dev         # agent service only (tsx watch)
pnpm --filter @autodidact/agent test        # run vitest tests
pnpm --filter @autodidact/agent typecheck   # tsc --noEmit
pnpm --filter @autodidact/agent build       # compile to dist/
```

---

## Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/course/generate` | Invoke course-generation graph; returns `{ blueprint }` |
| POST | `/module-chat/stream` | Stream module-chat graph output via SSE |
| POST | `/embeddings/text` | Generate a text embedding vector |
| GET | `/health` | Liveness; process is up. Dependency-free `{ status: "ok" }` |
| GET | `/ready` | Readiness; 200 once providers init and the checkpoint store answers `ping()`, else 503 |

---

## Key Decisions

- [ADR-005 — AI agent server framework](../../docs/architecture/ADRs/services/agent/ADR-005-ai-agent-server-framework.md) (Fastify)
- [ADR-006 — AI orchestration framework](../../docs/architecture/ADRs/services/agent/ADR-006-ai-orchestration-framework.md) (LangGraph)
- [ADR-011 — Real-time streaming transport](../../docs/architecture/ADRs/services/agent/ADR-011-realtime-streaming-transport.md) (SSE)
- [ADR-009 — External vendor abstraction](../../docs/architecture/ADRs/packages/providers/ADR-009-external-vendor-abstraction.md)
