# ADR-006: AI orchestration framework

## Status

Accepted
Date: 2026-05-10

## Context

Autodidact's two AI workflows are:

1. **Course generation** — single-LLM-call graph with retry-on-validation-
   failure (up to 3 attempts), output validated against Zod schema. Stateless
   per request.
2. **Module chat** — multi-turn conversation with persisted state. The user
   sends a message, the LLM responds (streamed token-by-token), and the
   conversation thread (`thread_id` ↔ `sessionId`) persists across requests
   so the next turn has context. Module completion is signaled by a magic
   marker (`[MODULE_COMPLETE:score=N]`) the model emits at the end of the
   exchange.

Both workflows want: structured stateful execution, retry logic, easy
streaming, and a clean way to swap LLM vendors ([ADR-009](../../packages/providers/ADR-009-external-vendor-abstraction.md)).
Module chat additionally needs **conversation checkpointing** — the
ability to save state between turns and resume. We use in-memory
checkpointer in dev (`MemorySaver`) and Postgres in prod (`PostgresSaver`).

This ADR sits inside the agent service ([ADR-005](./ADR-005-ai-agent-server-framework.md))
and is consumed by [ADR-009](../../packages/providers/ADR-009-external-vendor-abstraction.md)
(`ICheckpointerProvider` returns a LangGraph `BaseCheckpointSaver`). It
shapes [ADR-011](./ADR-011-realtime-streaming-transport.md) (the streaming
transport works around whatever the orchestrator yields).

## Non-goals

- Specific graph topology — owned by `services/agent/src/graphs/*/CLAUDE.md`.
- Prompt templates — owned by `packages/prompts`.
- LLM vendor — wrapped by `ILLMProvider` ([ADR-009](../../packages/providers/ADR-009-external-vendor-abstraction.md)).
- Checkpointer storage backend — operational, owned by `packages/providers/CLAUDE.md` (memory in dev, Postgres in prod).

## Decision Drivers

- **Stateful conversations with checkpointing** — module chat needs durable, resumable state across turns. Without first-class persistence, every turn would reload the whole transcript.
- **Token streaming** — the user-facing chat experience requires streaming tokens to the SSE response. Whatever orchestrator we pick must expose a streaming API.
- **Structured retry logic** — course generation retries on `safeParse` failure (up to 3 times). The orchestrator should make conditional edges and retry loops first-class, not hand-rolled.
- **TypeScript ergonomics** — solo team, TS-only. The orchestrator's API shape should make a graph definition readable.
- **Vendor neutrality** — the orchestrator must not lock us into a specific LLM vendor.
- **Production maturity** — we are running this in production; rough edges in the orchestrator translate into 500s users see.
- **Migration cost from current state** — we already have working LangGraph code. Switching costs are real; not zero.

## Options Considered

### Option A: LangGraph (current)
**What it is:** Graph-based orchestration framework. State is a typed object; nodes are functions; edges are conditional or unconditional. Built-in checkpointers (in-memory, Postgres, SQLite, Redis). First-class streaming. Built on LangChain's model abstractions.

**Pros**
- Checkpointing is the central feature — `MemorySaver` for dev, `PostgresSaver` for prod, both via the `compile({ checkpointer })` API. Resuming a conversation is `graph.invoke(input, { configurable: { thread_id } })`.
- Stream API yields tokens as they're generated; integrates naturally with our SSE handler.
- Conditional edges express the course-generation retry loop directly: `conditionalEdges('generateBlueprint', shouldRetry, { retry: 'generateBlueprint', done: END })`.
- Built on LangChain models (`BaseChatModel`); pairs with our [provider abstraction](../../packages/providers/ADR-009-external-vendor-abstraction.md) without translation.
- Production-stable; used at significant scale by paying customers.
- Backed by LangChain Inc., active maintenance, fast issue response.

**Cons**
- TypeScript ecosystem is smaller than Python's. Tutorials, examples, and integration patterns lean Python-first. We've felt this when looking up patterns.
- LangChain inherits a "do everything" surface area — even though LangGraph itself is focused, the LangChain dependency tree is heavy. ~101 KB gzipped for LangChain JS proper.
- Some idioms (state reducer functions, `Annotation` types) are not the most obvious TypeScript patterns. New devs ramp on these for a few hours.
- Tied to LangChain's evolution. The TS package occasionally lags Python; breaking changes between minor versions have hit us before.
- "Memory" in LangGraph means *checkpointing*, not semantic memory. Newer frameworks (Mastra, CrewAI) include built-in semantic memory; if we ever needed that pattern, LangGraph would require us to build it.

### Option B: Mastra
**What it is:** TypeScript-native agent framework gaining traction in 2026. Built-in agents, workflows, RAG, semantic memory, tool calling, MCP support, evals, observability. First-class TypeScript design.

**Pros**
- TypeScript-first, not a Python port. API ergonomics are designed for TS idioms.
- All-in-one: workflows + memory + RAG + MCP — if we wanted those features, they're integrated rather than glued on.
- Bundled observability and evals.
- Workflow `.branch()` API expresses conditional logic cleanly.
- Growing ecosystem and community in 2026; recommended for new TS projects in several recent comparisons.

**Cons**
- We don't use the all-in-one pieces. We have BullMQ for job orchestration ([ADR-007](../../_superseded/ADR-007-background-job-queue.md)), pgvector for our specific course-similarity use case ([ADR-010](../../packages/db/ADR-010-vector-search-strategy.md)), pino + OTel for observability ([ADR-017](../../packages/observability/ADR-017-observability-stack.md)). Mastra's bundle bring-along is value we don't use.
- Mastra's *checkpoint* model is different from LangGraph's. Migrating means rewriting `state.ts` and reasoning about persistence boundaries again.
- Younger production track record. LangGraph has years; Mastra has roughly one year of widespread use as of 2026.
- Migration cost: we have functioning LangGraph code with checkpointing wired through `ICheckpointerProvider`. Replacing it is real engineering effort, not a config change.
- Integration with our [provider abstraction](../../packages/providers/ADR-009-external-vendor-abstraction.md) currently returns LangChain `BaseChatModel`. Switching to Mastra would mean changing that interface or adding a translation layer.

### Option C: Vercel AI SDK 6
**What it is:** Lightweight TypeScript-first SDK for LLM interaction. Streaming, structured output, tool calling, agent patterns, durable workflow steps (added in v6). Bundle-size-conscious; clean provider switching.

**Pros**
- Cleanest provider-switching API in 2026. `openai("gpt-4o")` ↔ `anthropic("claude-...")` is one line.
- Smaller bundle (~67 KB) than LangChain JS (~101 KB).
- Streaming, structured output, tool calling are excellent.
- v6 added `DurableAgent` for resumable workflow steps, narrowing the gap with LangGraph for stateful flows.
- First-class DX; well-documented; used widely.

**Cons**
- Designed for "handoff chains" rather than graph-based orchestration. Our module-chat graph (with conditional edges, multiple nodes, state reducers) is closer to LangGraph's sweet spot than Vercel's.
- `DurableAgent` is real but newer and less battle-tested than LangGraph's checkpointing for production-grade conversation persistence.
- Different model abstraction than LangChain. The agent's existing graph code uses `BaseChatModel`; switching means changing the [provider abstraction](../../packages/providers/ADR-009-external-vendor-abstraction.md) interfaces.
- Vercel ownership — non-trivial vendor concentration with Turbo ([ADR-001](../../cross-cutting/ADR-001-monorepo-build-orchestration.md)). Manageable but worth flagging.

### Option D: Inngest workflows (durable steps + LLM calls)
**What it is:** Inngest as both job runner and durable workflow engine. Steps that call the LLM and persist results.

**Pros**
- Durable steps with replay-ability are excellent for retry logic.
- One vendor for jobs + workflows; consolidates infrastructure.
- Function-based API is clean.

**Cons**
- Inngest is fundamentally a job platform with workflow primitives, not a conversation orchestrator. Graph-based stateful chat (with checkpoints loaded between turns from a `thread_id`) is awkward.
- Adopting Inngest here would also mean reconsidering [ADR-007](../../_superseded/ADR-007-background-job-queue.md) — and we already have BullMQ working there.
- Vendor concentration with Inngest if we used them for both.
- Not what Inngest's strengths optimize for.

### Option E: Raw LLM calls + custom state machine
**What it is:** Drop the orchestration framework. Hand-write the state machine for course generation (a `while (retryCount < 3)` loop) and module chat (load checkpoint from DB, invoke LLM, save checkpoint, stream tokens).

**Pros**
- Zero abstraction — what runs is what we wrote.
- Full control over checkpoint format, retry semantics, token streaming.
- Smallest possible dependency footprint.

**Cons**
- We rebuild what LangGraph gives us: the streaming token loop, the checkpoint serialization, the conditional retry logic. Each is solvable but each costs days.
- Easy to introduce subtle bugs: stream-and-save ordering, partial-state recovery, transactional consistency between checkpoint and message persistence.
- Loss of vendor support and patterns. When something fails in production, we own all of it.
- A fine choice for *very* small projects where the orchestrator itself is a few hundred lines. As soon as we want a second graph or richer conditional logic, we end up reimplementing the orchestrator.

## Decision

**We use LangGraph (TypeScript).**

## Rationale

Lining up the drivers:

- **Stateful conversation with checkpointing (#1)**: A is purpose-built for this. C's `DurableAgent` is real but newer; B's workflow model handles it but isn't as conversation-shaped; D and E require rebuilding the wheel.
- **Token streaming (#2)**: A, B, C all good. D and E require manual streaming wiring.
- **Structured retry logic (#3)**: A's conditional edges express our 3-retry course-generation loop in a few lines. Other options either require workflow primitives (B/D) or hand-written loops (C/E).
- **TypeScript ergonomics (#4)**: B and C win on TS-native ergonomics. A is workable but not the most idiomatic TS.
- **Vendor neutrality (#5)**: A and B are vendor-neutral; C is Vercel; D is Inngest. A wins via LangChain's broad provider support, paired with our abstraction.
- **Production maturity (#6)**: A wins (years of large-scale production use). B is rapidly maturing but younger.
- **Migration cost (#7)**: A has zero. Any of B/C/D/E imposes real rewriting cost on graphs that work today.

The first-principles ranking favors **A (LangGraph)** because our actual
needs (graph topology, checkpointing, retry loops, vendor neutrality)
align with LangGraph's strengths. Mastra (B) is the strongest alternative
for new TypeScript projects in 2026, but its biggest wins (semantic
memory, RAG, integrated observability) are features we don't use — we have
those concerns covered by other ADRs.

What we are sacrificing by picking LangGraph over Mastra:

- A more idiomatic TypeScript API surface.
- Built-in semantic memory we don't currently need.
- Slightly cleaner integration with newer agent patterns (MCP).

What we are sacrificing by picking LangGraph over Vercel AI SDK:

- Best-in-class provider-switching ergonomics (which we get partially via [ADR-009](../../packages/providers/ADR-009-external-vendor-abstraction.md) regardless).
- Smaller bundle size.

No reconsideration flag is raised. LangGraph is the first-principles
choice for our specific intersection (graph orchestration + checkpointing +
production maturity + existing investment). The argument for switching is
weakest precisely because our use case is squarely inside LangGraph's
sweet spot.

## Consequences

### Positive
- Course generation graph is ~150 lines of declarative state + node + conditional edge code.
- Module chat checkpointing works via `compile({ checkpointer })` and `{ configurable: { thread_id } }` — no custom persistence layer.
- Token streaming is a primitive: `for await (const chunk of graph.stream(...))`.
- LangGraph's evolution maps to ours; new graph patterns and improvements are incremental adoption, not migration.

### Negative
- LangChain dependency tree is heavy on the agent service's bundle.
- Smaller TS-language community than Python; some patterns we figure out from Python sources.
- LangGraph's `Annotation` and reducer concepts add a learning step for new contributors.
- TS package occasionally lags Python in feature releases.

### Follow-up decisions
- Specific graph design (state shape, node responsibilities, retry semantics) — owned by `services/agent/src/graphs/*/CLAUDE.md`.
- Checkpointer choice (memory dev / Postgres prod) — owned by [ADR-009](../../packages/providers/ADR-009-external-vendor-abstraction.md).
- Reconsider this ADR if: our use case shifts toward heavy semantic memory or RAG (Mastra's integrated story would matter), LangChain TS development materially slows, or we need agentic patterns (MCP, tool-use loops, sub-agent delegation) Mastra or Vercel AI SDK supports more cleanly.

## Update

**2026-09-01** — [ADR-027](../worker/ADR-027-background-job-queue-cloud-tasks.md)
executed ADR-007's flagged migration: the queue moved from BullMQ + Memorystore
Redis to GCP Cloud Tasks. Options B and D reference BullMQ (ADR-007) as our job
orchestrator; read those as Cloud Tasks — the arguments are unaffected. The
decision recorded here is unchanged.
