# @autodidact/e2e — Cross-service end-to-end tests

> Agent-binding rules live in [CLAUDE.md](./CLAUDE.md).

The top of the test pyramid (ADR-024). Boots the **real** `api`, `agent`, and
`worker` services as child processes against Testcontainers Postgres + Redis,
with the LLM/embedding/auth swapped to deterministic mock providers
(`*_PROVIDER=mock`), and drives complete user journeys over real HTTP, SSE, and
BullMQ.

## What it covers

The golden path, end to end across all three services:

1. **Create** a course (`POST /v1/courses`) → api enqueues a BullMQ job.
2. **Generate** — the worker picks up the job, calls the agent (mock LLM), and
   writes the course `ready` + module rows.
3. **Enroll** → `module_progress` rows (position 0 `available`, rest `locked`).
4. **Chat** a turn over SSE → the teacher signals completion.
5. **Complete & unlock** — the module flips `completed` and the next unlocks.

Plus an auth-rejection failure path.

## Running

```bash
pnpm build                              # services must be compiled to dist/ first
pnpm --filter @autodidact/e2e test:e2e
```

Requires Docker. Not part of the default `pnpm test` gate (see CLAUDE.md).

## How it works

`src/harness.ts` boots Postgres + Redis (via `@autodidact/test-support`), then
spawns each service's `dist/main.js` with env pointed at the containers and the
mock providers, waits for health, and returns handles plus a `db`/`pool` for
assertions and a `stop()` teardown.
