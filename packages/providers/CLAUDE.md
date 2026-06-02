# Subtree Instructions — packages/providers/

> These rules apply only within `packages/providers/`. They extend the root `CLAUDE.md`.

## Purpose of this subtree

Provider interfaces, factory functions, and concrete implementations for all external vendor dependencies: LLM, embeddings, job queue, auth, and LangGraph checkpointer. Prevents services from hard-coding vendor SDKs.

---

## Invariants (must not be broken)

- Never import concrete provider classes directly in service code. Services must call the factory function (`createLLMProvider()`, etc.) and receive an interface type. Concrete classes are an internal detail of this package.
- The five provider interfaces are: `ILLMProvider`, `IEmbeddingProvider`, `IQueueProvider`, `IAuthProvider`, `ICheckpointerProvider`. All live in `src/interfaces/`.
- The active provider is selected by the factory function reading an env var (`LLM_PROVIDER`, `EMBEDDING_PROVIDER`, `AUTH_PROVIDER`, `CHECKPOINTER`). Do not add provider-selection logic anywhere outside `src/factory.ts`.
- A `mock` option exists for `LLM_PROVIDER`, `EMBEDDING_PROVIDER`, and `AUTH_PROVIDER` — deterministic, network-free implementations used **only** by the cross-service e2e (`@autodidact/e2e`). Never select `mock` in dev or production.
- To add a new provider implementation: create `src/implementations/<category>/<name>.provider.ts`, implement the interface, add the selection branch in `factory.ts`, and update the README env var table. No service code should change.
- `ILLMProvider.getModel()` returns a LangChain `BaseChatModel` — the interface is intentionally LangChain-aware because all LLM usage goes through LangGraph.
- `ICheckpointerProvider.getCheckpointer()` returns a LangGraph `BaseCheckpointSaver`. Use `memory` in development/tests; `postgres` in production (requires `DATABASE_URL`).

---

## Library / tooling rules

- Use: LangChain/LangGraph types (`BaseChatModel`, `Embeddings`, `BaseCheckpointSaver`) as the return types in interfaces — this keeps the abstraction LangChain-compatible without coupling to specific SDKs.
- Do not use: vendor SDKs (openai, anthropic, @supabase/supabase-js, bullmq, ioredis) outside of `src/implementations/`.

---

## Source of truth

- `src/factory.ts` is the source of truth for which env vars control provider selection and what the valid option values are.
- `packages/providers/README.md` is the source of truth for the env var → factory → options → default table.

---

## Key patterns to follow

- Factory functions accept an optional `ProviderConfig` object. Config fields take precedence over env vars. This allows tests to inject overrides without touching `process.env`.
- The `cohere-embedding.provider.ts` implementation exists but is marked as a stub and is not production-ready. Do not enable it without validating output dimensions and API compatibility.

---

## Anti-patterns to avoid

- Do not `new OpenAILLMProvider(...)` in service code — always go through `createLLMProvider()`.
- Do not add vendor-specific API features (e.g., OpenAI function calling parameters) to an interface — generalize or add an escape hatch method, then document the decision.
- `createEmbeddingProvider()` selects on `EMBEDDING_PROVIDER` (`openai` default, or `mock` for e2e). Cohere remains a stub — do not enable it without validating dimensions.

---

## Key Decisions

- [ADR-009 — External vendor abstraction](../../docs/architecture/ADRs/packages/providers/ADR-009-external-vendor-abstraction.md) (custom interfaces + factories)
- [ADR-006 — AI orchestration framework](../../docs/architecture/ADRs/services/agent/ADR-006-ai-orchestration-framework.md) (LangGraph — shapes the LLM/checkpointer return types)
- [ADR-007 — Background job queue](../../docs/architecture/ADRs/services/worker/ADR-007-background-job-queue.md) (BullMQ — shape of `IQueueProvider`)
- [ADR-020 — Authentication strategy](../../docs/architecture/ADRs/cross-cutting/ADR-020-authentication-strategy.md) (Supabase Auth — shape of `IAuthProvider`)
