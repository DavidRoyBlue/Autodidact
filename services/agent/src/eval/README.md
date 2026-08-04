# Agent eval harness

> Local-first evaluation + regression gate for the agent graphs. Binding rules live in the parent `services/agent/AGENTS.md`.

The regression gate that protects the capability phases (RAG, tools, memory, multi-agent). It runs the
graphs against seed datasets, applies deterministic scorers, and fails when a scorer's pass rate drops
below threshold.

## Layout

| File | Role |
|------|------|
| `scorers.ts` | Pure, deterministic scorers (schema pass, blueprint quality, marker-leak, completion calibration, tutoring relevance). Unit-tested in `__tests__/eval-scorers.test.ts`. |
| `datasets.ts` | Seed eval cases (course-gen topics, tutoring turns). Grow alongside new behaviors. |
| `run.ts` | Runner: executes graphs, applies scorers, prints a summary, exits non-zero on regression. |

## Running

```bash
pnpm eval        # from repo root: builds, then runs the compiled runner against .env.dev
```

Requires a live LLM key (`OPENAI_API_KEY`, or the configured `LLM_PROVIDER`'s key). Without one the runner
prints a skip notice and exits 0, so secret-less CI is not blocked — the scorers stay covered by unit tests.

Set `LANGCHAIN_TRACING_V2=true` + `LANGSMITH_API_KEY` to capture each run in LangSmith automatically.

## Why compiled (`node dist/...`), not `tsx`

The runner is run as compiled output rather than via `tsx`. In this repo's Node + tsx environment, importing
named exports from the CommonJS workspace barrels (`@autodidact/observability`, `@autodidact/prompts`, …)
from ESM under `tsx` can fail at link time (`does not provide an export named ...`) even though plain Node
and the compiled build resolve them correctly. This is a pre-existing CJS/ESM interop limitation — it also
affects `pnpm dev` for the agent — and is tracked for a durable fix (ESM-migrate the workspace packages)
alongside the LangChain upgrade in [ADR-023](../../../../docs/architecture/ADRs/cross-cutting/ADR-023-langchain-1x-upgrade-deferral.md).

## CI

Add a job that runs `pnpm eval` with `OPENAI_API_KEY` (and optionally `LANGSMITH_API_KEY`) in the secret
store. The runner's non-zero exit on a threshold breach is the gate.
