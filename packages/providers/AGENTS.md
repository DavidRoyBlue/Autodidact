# Subtree Instructions — packages/providers/

> These rules apply only within `packages/providers/`. They extend the root `AGENTS.md`.

## Purpose of this subtree

Provider interfaces, factory functions, and concrete implementations for external vendor dependencies: embeddings, job queue, auth. Prevents services from hard-coding vendor SDKs.

---

## Invariants (must not be broken)

- Never import concrete provider classes directly in service code. Services must call the factory function (`createEmbeddingProvider()`, etc.) and receive an interface type. Concrete classes are an internal detail of this package.
- The three provider interfaces are: `IEmbeddingProvider`, `IQueueProvider`, `IAuthProvider`. All live in `src/interfaces/`.
- The active provider is selected by the factory function reading an env var (`EMBEDDING_PROVIDER`, `QUEUE_PROVIDER`, `AUTH_PROVIDER`). Do not add provider-selection logic anywhere outside `src/factory.ts`.
- A `mock` option exists for `EMBEDDING_PROVIDER` and `AUTH_PROVIDER` — deterministic, network-free implementations used **only** by the cross-service e2e (`@autodidact/e2e`). Never select `mock` in dev or production.
- To add a new provider implementation: create `src/implementations/<category>/<name>.provider.ts`, implement the interface, add the selection branch in `factory.ts`, and update the README env var table. No service code should change.

---

## Library / tooling rules

- Use: `@langchain/core`'s `Embeddings` type as the return type of `IEmbeddingProvider` — this keeps the embedding abstraction LangChain-compatible without coupling to a specific SDK.
- Do not use: vendor SDKs (openai, @supabase/supabase-js, @google-cloud/tasks, google-auth-library) outside of `src/implementations/`.

> **Exception — transport auth helpers.** `cloudRunAuthHeaders` (`src/implementations/auth/cloud-run-id-token.ts`) is exported as a plain function, **not** a factory-selected provider. Outbound Cloud Run service-to-service OIDC (minting an ID token to call a private peer) is a cross-cutting transport concern — it is neither one of the provider interfaces nor an `IAuthProvider` method (`IAuthProvider` verifies *inbound* JWTs). It still lives under `src/implementations/` so the `google-auth-library` SDK stays out of service code. Keep such helpers rare and SDK-isolated; do not turn this into a general "export raw functions" loophole.

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

- Do not `new OpenAIEmbeddingProvider(...)` in service code — always go through `createEmbeddingProvider()`.
- Do not add vendor-specific API features to an interface — generalize or add an escape hatch method, then document the decision.
- `createEmbeddingProvider()` selects on `EMBEDDING_PROVIDER` (`openai` default, or `mock` for e2e). Cohere remains a stub — do not enable it without validating dimensions.

---

## Key Decisions

- [ADR-009 — External vendor abstraction](../../docs/architecture/ADRs/packages/providers/ADR-009-external-vendor-abstraction.md) (custom interfaces + factories)
- [ADR-027 — Background job queue — migrate to GCP Cloud Tasks](../../docs/architecture/ADRs/services/worker/ADR-027-background-job-queue-cloud-tasks.md) (Cloud Tasks / loopback — shape of `IQueueProvider`)
- [ADR-020 — Authentication strategy](../../docs/architecture/ADRs/cross-cutting/ADR-020-authentication-strategy.md) (Supabase Auth — shape of `IAuthProvider`)
- [ADR-031 — Module teacher on AgentPlatform](../../docs/architecture/ADRs/cross-cutting/ADR-031-module-teacher-on-agent-platform.md) (the LLM and checkpointer providers were removed — the module teacher runs on AgentPlatform)
