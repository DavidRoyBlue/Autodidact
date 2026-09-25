# Subtree Instructions — services/agent/

> These rules apply only within `services/agent/`. They extend the root `AGENTS.md`.

## Purpose of this subtree

Internal embeddings runtime. Generates text embeddings for the platform. Never exposed to the public internet. Called only by services/api and services/worker. Listens on `AGENT_PORT` (default 3001). Course generation and module teaching are runs on AgentPlatform now (ADR-030, ADR-031) — this service no longer runs any graph.

---

## Invariants (must not be broken)

- This service is INTERNAL ONLY — never expose port 3001 publicly.
- The embedding call goes through the `embeddingProvider` token (`IEmbeddingProvider`, from `createEmbeddingProvider({})`) — never import an embedding SDK directly in route code.
- `/ready` reports startup completion only (`isReady()` in `main.ts`) — there is no external dependency left to probe; the checkpointer readiness check went with the checkpointer (ADR-031).

---

## Library / tooling rules

**Use:**
- Fastify (not Express, not NestJS)
- `@autodidact/providers`'s `IEmbeddingProvider` (via `createEmbeddingProvider({})`) for the embedding call
- Zod for request body validation in routes

**Do not use:**
- NestJS
- Direct embedding SDK imports in route files
- LangChain/LangGraph — removed from this service's dependencies (ADR-031). The LLM/checkpointer provider layer in `packages/providers` still declares LangChain-typed interfaces, but nothing in this service calls it; do not wire it back up here.

---

## Source of truth

- Embeddings HTTP contract: `services/agent/src/routes/README.md`
- Provider interfaces: `packages/providers/src/`

---

## Key patterns to follow

- **Request validation:** use Zod `parse()` or `safeParse()` in routes and return a structured 400 before the provider is called on invalid input.

---

## Anti-patterns to avoid

- Do not put embedding calls directly in route handlers without going through `IEmbeddingProvider`.
- Do not hardcode model names — use the provider abstraction.
- Do not reintroduce a graph, checkpointer, or LLM chat call into this service — the module teacher runs on AgentPlatform's `course-teacher` agent (ADR-031); this service is embeddings-only.

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
| POST | `/embeddings/text` | Generate a text embedding vector |
| GET | `/health` | Liveness; process is up. Dependency-free `{ status: "ok" }` |
| GET | `/ready` | Readiness; 200 once startup completes, else 503 |

---

## Key Decisions

- [ADR-031 — The module teacher runs on AgentPlatform](../../docs/architecture/ADRs/cross-cutting/ADR-031-module-teacher-on-agent-platform.md) (this service loses the module-chat graph, route, retriever, error mapping and eval harness; it keeps only embeddings and health)
- [ADR-030 — Course generation runs on AgentPlatform's course-creator workflow](../../docs/architecture/ADRs/cross-cutting/ADR-030-course-generation-on-agent-platform.md)
- [ADR-005 — AI agent server framework](../../docs/architecture/ADRs/services/agent/ADR-005-ai-agent-server-framework.md) (Fastify)
- [ADR-009 — External vendor abstraction](../../docs/architecture/ADRs/packages/providers/ADR-009-external-vendor-abstraction.md)
