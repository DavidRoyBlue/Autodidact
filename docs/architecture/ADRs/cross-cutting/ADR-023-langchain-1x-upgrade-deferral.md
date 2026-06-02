# ADR-023: Defer the LangChain/LangGraph 1.x major upgrade

## Status

Accepted — 2026-06-02

## Context

The agent runtime depends on `@langchain/langgraph ^0.2.0`, `@langchain/core ^0.3.0`,
`@langchain/openai ^0.3.0`, and `@langchain/anthropic ^0.3.0` (resolving to langgraph
0.2.74 / core 0.3.80). During the production-hardening program we evaluated upgrading the
whole LangChain stack to its current major: langgraph 1.3.3 / core 1.1.48 / openai 1.4.7 /
anthropic 1.4.0.

The original motivation was first-class `ToolNode`, `BaseStore`, and `Command` ergonomics
for the upcoming capability phases (RAG, agentic tools, learner memory, multi-agent course
generation). On inspection, **all three primitives already exist in the installed 0.2.74**
(`@langchain/langgraph/prebuilt` `ToolNode`, `@langchain/langgraph` `BaseStore`/
`InMemoryStore`, `Command`), so the upgrade is not a prerequisite for that work.

A trial upgrade surfaced two blockers:

1. **CJS/ESM dual-package type hazard.** `packages/providers` is CommonJS (no `"type"`
   field); `services/agent` is ESM (`"type": "module"`). Both depend on LangChain. Under
   `moduleResolution: "NodeNext"`, LangChain 1.x type definitions reference `@langchain/core`
   via `import(..., { with: { "resolution-mode": "import" } })`. This makes the `BaseChatModel`
   and `BaseCheckpointSaver` type identities differ across the CJS→ESM package boundary, so
   values produced in `providers` (e.g. `getModel()`, `getCheckpointer()`) no longer typecheck
   when passed to langgraph APIs in `agent` (`_separateRunnableConfigFromCallOptionsCompat`/
   `inheritableHandlers` "protected member" errors). A single `@langchain/core` pnpm override
   collapses the *version* to one but not the *resolution-mode* identity split.
2. **Unvalidatable offline.** LangChain 1.x also changed runtime behavior (message content
   blocks, streaming event shapes). Our unit tests mock the chat model, so they cannot catch
   runtime drift in real streaming/tool-calling, and the eval harness (ADR for observability &
   evals) requires live API keys. A green typecheck + mocked test run would not prove the
   upgrade safe.

A clean fix for (1) requires either migrating `packages/providers` to ESM — whose blast
radius includes the CommonJS consumers `services/api` (NestJS) and `services/worker` — or a
repo-wide module-resolution change. Neither is appropriate to land blind, without live
validation.

A related finding: the Postgres checkpointer dynamically imports
`@langchain/langgraph-checkpoint-postgres`, but that package is **not declared as a dependency**
of `packages/providers`. `CHECKPOINTER=postgres` therefore fails to resolve it at runtime. The
correct version is coupled to the langgraph version (0.2.x pairs with checkpoint-postgres 0.0.x;
1.x with 1.0.x), so the fix belongs with the version decision.

## Decision

Stay on the LangChain 0.2.x/0.3.x line for now. Defer the 1.x major upgrade to a dedicated PR
that:

- migrates `packages/providers` to ESM (or otherwise unifies module resolution) so the
  dual-package type identities collapse;
- declares `@langchain/langgraph-checkpoint-postgres` at the version matching the chosen
  langgraph release;
- is validated against live LLM/embedding APIs and a real Postgres checkpointer, gated by the
  eval harness, before merge.

The capability phases (1–4) build on the 0.2.74 primitives, which are sufficient.

## Consequences

### Positive

- The hardening program lands on a known-good, fully green dependency set with no unsafe casts.
- The upgrade is scoped to a single, independently reviewable and live-validated PR.
- The dual-package hazard and the undeclared checkpoint-postgres dependency are documented, so
  the upgrade PR starts informed.

### Negative

- The codebase trails the current LangChain major; security/feature updates in 1.x are not yet
  available.
- `CHECKPOINTER=postgres` remains unusable until the checkpoint-postgres dependency is declared
  (tracked as a follow-up in the upgrade PR).

### Neutral

- No application code changed for this decision; it is a dependency-strategy record.

## Alternatives considered

- **Force the 1.x upgrade with `as never` casts at the provider→langgraph boundary.** Rejected:
  masks genuine type-identity mismatches and risks silent runtime breakage in streaming/tool
  calling that mocked tests cannot detect.
- **Migrate `packages/providers` to ESM now.** Rejected for this PR: the CommonJS consumers
  (`services/api`, `services/worker`) would need coordinated changes and live validation —
  larger than a hardening change should carry, and better isolated in the upgrade PR.
- **Pin a single `@langchain/core` via pnpm override only.** Insufficient: unifies the version
  but not the import/require resolution-mode type identity under NodeNext.

## References

- ADR-006: AI orchestration framework (LangGraph) — `services/agent/ADR-006-ai-orchestration-framework.md`
- ADR-009: External vendor abstraction — `packages/providers/ADR-009-external-vendor-abstraction.md`
- `packages/providers/src/implementations/checkpointer/postgres.provider.ts` (dynamic import)
