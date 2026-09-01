# ADR-009: External vendor abstraction

## Status

Accepted
Date: 2026-05-10
Documentation revised: 2026-09-01

## Context

Three services (`api`, `agent`, `worker`) and several packages depend on
external vendors: an LLM provider (OpenAI today; Anthropic also wired up),
an embedding provider (OpenAI), a job queue (BullMQ on Redis), an auth
provider (Supabase JWT verification), and a LangGraph conversation
checkpointer (in-memory in dev, Postgres in prod).

If each service imports vendor SDKs directly, three problems compound:
(1) swapping a vendor in response to pricing or capability changes touches
many files in many services; (2) unit tests must mock SDK modules
(monkey-patching imports), which is brittle; (3) the contract that *any*
LLM provider must satisfy lives nowhere — it's implicit in call sites,
which means new providers are reverse-engineered rather than implemented
against an interface.

This ADR is about the **structure of vendor abstraction**, not about which
vendors we use. The actual vendor choices live in their own ADRs (LLM
orchestration in [ADR-006](../../services/agent/ADR-006-ai-orchestration-framework.md),
queue in [ADR-007](../../_superseded/ADR-007-background-job-queue.md),
auth in [ADR-020](../../cross-cutting/ADR-020-authentication-strategy.md),
hosting in [ADR-012](../../infra/ADR-012-cloud-hosting-platform.md)). It sits
upstream of those ADRs because any of them could be reconsidered without
restructuring the abstraction.

## Non-goals

- Choosing the LLM, embedding, queue, auth, or checkpointer vendor. Those decisions are owned by their respective ADRs.
- Deciding whether to use LangChain at all. That is part of [ADR-006 (AI orchestration)](../../services/agent/ADR-006-ai-orchestration-framework.md).
- A general-purpose service container. This is about *external* vendors, not internal service wiring.

## Decision Drivers

- **Vendor portability** — pricing and capability shifts in the LLM market mean we should be able to swap vendors in days, not weeks.
- **Test ergonomics** — unit tests must run without network access; producing a mock provider must be a one-liner. This is the daily-driver pain if we get it wrong.
- **Config-driven selection** — the active provider is chosen by env var so a deploy can switch without a code change.
- **Minimum cognitive load** — small team; the abstraction layer should be a few hundred lines, not a framework.
- **Compatibility with chosen runtimes** — the API service uses NestJS DI; the agent service uses Fastify (manual wiring); the worker has no HTTP framework. Whatever abstraction we choose has to work in all three without a runtime.
- **Honest blast radius** — when a vendor-specific feature is needed (e.g., OpenAI structured output, Anthropic extended thinking), the abstraction must either generalize cleanly or provide an honest escape hatch.

## Options Considered

### Option A: Direct SDK imports — no abstraction
**What it is:** Services import `openai`, `@anthropic-ai/sdk`, `@supabase/supabase-js`, `bullmq` directly. Provider selection lives wherever it's needed (`if (env.LLM === 'anthropic') ...`).

**Pros**
- Zero indirection; reading service code shows exactly which SDK and which version of each call is in use.
- No interface debt — vendor-specific features are reachable without escape hatches.
- Easiest mental model for a new developer ("just call OpenAI").

**Cons**
- Vendor changes ripple through every consumer. The provider-selection `if` is duplicated everywhere it's needed (LLM in `agent`, embedding in `agent` + `worker`, auth in `api`, queue in `api` + `worker`).
- Tests must mock SDK modules with `vi.mock('openai', ...)` or similar. Mocks are brittle (path-sensitive, hard to scope), tend to leak between tests, and don't survive SDK upgrades cleanly.
- No single contract: the de-facto interface is whatever surface area we happen to call. New providers are guesswork.
- Dropping the abstraction now is a one-way door — once vendor APIs are spread across the codebase, re-introducing an abstraction is a much larger refactor than building it correctly the first time.

### Option B: Custom typed interfaces + factory functions (current)
**What it is:** Five interfaces (`ILLMProvider`, `IEmbeddingProvider`, `IQueueProvider`, `IAuthProvider`, `ICheckpointerProvider`) in `packages/providers/src/interfaces/`. Concrete implementations in `src/implementations/`. Five factories (`createLLMProvider`, etc.) in `src/factory.ts` read env vars and return interface-typed instances. Tests inject mocks by passing a `ProviderConfig` override or by providing a fake at the call site.

**Pros**
- Centralizes the env-var → implementation mapping in one ~70-line file (`factory.ts`). Service code never branches on vendor.
- Mock providers are plain objects fulfilling an interface — no module-level monkey-patching. `makeMockLLMProvider()` is reusable across all three services' test suites via `@autodidact/config/test-utils`.
- Works identically under NestJS DI (factories register as providers), Fastify manual wiring, and the worker's plain-object construction. No framework dependency.
- Small surface area: the contract is the interface file; adding a vendor is "implement the interface, register a branch in `factory.ts`."
- Returns LangChain types (`BaseChatModel`, `Embeddings`, `BaseCheckpointSaver`) where the consumer is already a LangChain consumer (the agent service via LangGraph). This avoids a redundant abstraction layer over an abstraction.

**Cons**
- Adds an abstraction step: a developer reading service code must follow `createLLMProvider() → factory.ts → implementations/llm/anthropic.provider.ts` to see what's actually happening. The hop is small but real.
- Vendor-specific features (OpenAI structured-output, Anthropic extended thinking) force a choice: generalize the interface, ignore the feature, or add an escape hatch. Bypassing undermines the abstraction.
- Factory's env-var dispatch is hand-written `if/else`. Adding a third LLM provider is mechanical but easy to forget.
- Some interfaces wrap LangChain types; if we ever drop LangChain, the abstraction needs reshaping.

### Option C: Dependency-injection framework (InversifyJS or tsyringe)
**What it is:** A DI container manages provider lifecycle and injection. Services declare dependencies via decorators; the container resolves them based on configuration.

**Pros**
- Standard pattern — engineers from Java/Spring or Angular backgrounds find this familiar.
- Lifecycle management (singleton, transient, scoped) is built in.
- Constructor injection is uniform across services.
- Test substitution is a container-level concern: `container.rebind(ILLMProvider).to(MockProvider)`.

**Cons**
- Adds a runtime framework dependency just for vendor selection. The factory pattern (Option B) gives us 90% of the benefit with 10% of the framework cost.
- Decorator-based DI requires `reflect-metadata` and TS `experimentalDecorators` flag. The agent and worker would inherit this constraint without otherwise needing it.
- The API service already has a DI container (NestJS's). Bolting another DI framework alongside it is duplication; using NestJS DI for everything would lock the agent and worker into NestJS, which conflicts with their existing framework choices ([ADR-005](../../services/agent/ADR-005-ai-agent-server-framework.md), [ADR-007](../../_superseded/ADR-007-background-job-queue.md)).
- Onboarding cost: a new dev has to learn the container, the binding tokens, and the lifecycle model before they can add a provider.
- Lifecycle management is real value at large scale; at our scale the providers are all effectively singletons.

### Option D: Vercel AI SDK as the abstraction layer (LLM only)
**What it is:** Replace `ILLMProvider` with the Vercel AI SDK, which already provides a clean `openai("gpt-4o")` / `anthropic("claude-sonnet-4-20250514")` swap. Embedding/auth/queue/checkpointer keep their custom interfaces.

**Pros**
- The Vercel AI SDK is purpose-built for vendor switching; the abstraction is non-leaking and lightweight (~67 KB gzipped vs LangChain JS ~101 KB).
- Streaming, tool calling, and structured output are first-class without our own abstraction work.
- Vercel-backed and currently the dominant TS-only AI SDK in 2026; provider plugins keep up with model releases quickly.

**Cons**
- LangGraph (our orchestration framework, [ADR-006](../../services/agent/ADR-006-ai-orchestration-framework.md)) is built on LangChain models. Vercel AI SDK and LangChain are different model abstractions; mixing them in the same graph is non-trivial.
- We'd be coupling our LLM abstraction to LangGraph's plans for compatibility with non-LangChain models. As of 2026, LangGraph integrates more cleanly with LangChain models than with Vercel AI SDK models.
- Reduces the abstraction inventory by one (good) but introduces an external dependency on Vercel's roadmap (mixed). Vendor concentration risk increases (Vercel already owns Turborepo for us — [ADR-001](../cross-cutting/ADR-001-monorepo-build-orchestration.md)).
- Doesn't address auth, queue, embedding, or checkpointer — we'd still need a custom abstraction for those, undermining the simplification argument.

### Option E: Effect-style functional Layer/Context
**What it is:** Use the Effect ecosystem's `Context.Tag` and `Layer` system to provide vendor implementations. Services compose Effects that depend on tagged services; layers swap implementations.

**Pros**
- Compositional and type-safe at a level Option B cannot match.
- Test layers are values, not framework state — substitution is local and pure.
- Excellent for complex error handling and effect tracking.

**Cons**
- Effect is a paradigm shift, not a library. It restructures how *all* code is written, not just vendor wiring.
- The agent and worker services are not Effect projects; introducing Effect just for provider abstraction would be a tiny island in a non-Effect codebase, which is the worst of both worlds.
- Onboarding cost is in *weeks*, not hours, for a developer not already familiar.
- Severe over-engineering for "we want to swap OpenAI for Anthropic."

## Decision

**We keep custom typed interfaces + factory functions in `packages/providers`.**

## Rationale

The drivers fall out as follows:

- **Vendor portability (#1)**: A and C+D fail this. A bakes vendor calls into service code. C and D help but don't justify their cost over B. B already gets it: swap is one new file + one factory branch + one env var.
- **Test ergonomics (#2)**: Mock factories returning plain objects (B) are the lowest-friction option. A forces module-mocking, which is the single biggest source of brittle tests in TS codebases. C/E require framework-specific test setup; B requires nothing.
- **Config-driven selection (#3)**: B and C handle this naturally. A duplicates the dispatch.
- **Cognitive load (#4)**: B is one file (`factory.ts`, ~70 lines) plus one folder of interfaces. C and E add a framework. A has zero abstraction but the *implicit* cognitive load (where does provider selection happen? in 14 places) is higher than the *explicit* load of B.
- **Cross-runtime compatibility (#5)**: B is plain functions, works everywhere. NestJS DI integrates by registering the factory as a provider. Fastify wires it manually. Worker constructs at startup. C with InversifyJS would compete with NestJS's DI in the API service.
- **Honest blast radius (#6)**: B's escape hatch is "skip the interface and import the SDK directly for this one feature." That's not pretty but it's honest and reviewable. The alternative (forcing every vendor extension through the interface) is what makes abstractions rot.

What we are sacrificing by choosing B over A: a layer of indirection that
new developers will sometimes have to step through. Worth it.

What we are sacrificing by choosing B over D (Vercel AI SDK): a slightly
slimmer abstraction over LLMs specifically, at the cost of integrating with
LangGraph. The LangGraph dependency is the load-bearing constraint here,
and changing that is [ADR-006](../../services/agent/ADR-006-ai-orchestration-framework.md)'s
problem, not this ADR's.

No reconsideration flag is raised. The current architecture is the
first-principles answer for our scale, runtime mix, and test ergonomics.

## Consequences

### Positive
- Vendor swap is a one-day exercise for any of the five abstracted categories.
- Unit tests run with no network access by default; mock providers are reusable across services via `@autodidact/config/test-utils`.
- A new vendor is added by writing one file conforming to one interface — the contract is concrete, not folkloric.
- Provider configuration is centralized; there's exactly one place to look when a deploy "uses the wrong LLM."

### Negative
- One layer of indirection between service code and SDK. Reading code requires a hop through `factory.ts`.
- Vendor-specific features force a generalize-vs-bypass choice each time. We need editorial discipline to keep the interface useful.
- LangChain types in interfaces (`BaseChatModel`, `Embeddings`, `BaseCheckpointSaver`) couple us to LangChain. If [ADR-006](../../services/agent/ADR-006-ai-orchestration-framework.md) ever moves off LangGraph, the LLM/Embedding/Checkpointer interfaces need reshaping.

### Follow-up decisions
- LLM, embedding, queue, auth, checkpointer vendor choices are made in their own ADRs and consume this abstraction.
- Reconsider this ADR if: we drop LangGraph (interfaces lose their LangChain return types), provider count grows past ~10 (factory dispatch may justify a registry pattern), or a new vendor requires features the interface cannot reasonably generalize (forces a redesign of that interface).

## Update

**2026-09-01** — Two corrections since acceptance:

- [ADR-027](../../services/worker/ADR-027-background-job-queue-cloud-tasks.md)
  executed ADR-007's flagged migration: the queue implementation behind
  `IQueueProvider` moved from BullMQ + Redis to GCP Cloud Tasks (with a
  `loopback` provider for local dev). Context and Option A mention `bullmq`;
  read those as Cloud Tasks.
- The embedding-factory inconsistency this ADR originally flagged is fixed:
  `createEmbeddingProvider` now reads `EMBEDDING_PROVIDER` (and supports
  `mock`). The stale claims were removed from this document (see
  `Documentation revised` in Status).

The decision recorded here is unchanged.
