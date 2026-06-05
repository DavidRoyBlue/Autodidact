# @autodidact/env

> Agent-binding rules for this package live in [CLAUDE.md](./CLAUDE.md).

## Purpose

Typed, fail-fast environment validation for the backend services. Each service
validates `process.env` against a zod schema **once at boot** and then works
with a typed object. A missing or malformed variable becomes a single startup
error that names every offending var — instead of a silent empty connection
string or a late 401 on the first LLM call.

## Consumers

| Consumer | Usage |
|----------|-------|
| `services/api` | `loadApiEnv()` — first line of `bootstrap()` |
| `services/agent` | `loadAgentEnv()` — first line of `start()` |
| `services/worker` | `loadWorkerEnv()` — first line of `start()` |

## Public API

```typescript
import {
  loadApiEnv,     // validate + return ApiEnv, throws EnvValidationError on failure
  loadAgentEnv,   // validate + return AgentEnv
  loadWorkerEnv,  // validate + return WorkerEnv
  apiEnvSchema,   // the underlying zod schemas (exported for tests)
  agentEnvSchema,
  workerEnvSchema,
  EnvValidationError,
  type ApiEnv,
  type AgentEnv,
  type WorkerEnv,
} from '@autodidact/env';

async function bootstrap() {
  const env = loadApiEnv(); // throws here if config is invalid
  await app.listen(env.API_PORT, '0.0.0.0');
}
```

## Required variables per service

Derived from runtime usage (some are conditional):

| Service | Required | Conditional | Optional (defaulted) |
|---------|----------|-------------|----------------------|
| `api` | `DATABASE_URL`, `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | — | `AGENT_SERVICE_URL`, `API_PORT` |
| `agent` | `OPENAI_API_KEY` | `DATABASE_URL` (if `CHECKPOINTER=postgres`), `ANTHROPIC_API_KEY` (if `LLM_PROVIDER=anthropic`) | `LLM_PROVIDER`, `CHECKPOINTER`, `AGENT_PORT` |
| `worker` | `DATABASE_URL`, `REDIS_URL` | — | `AGENT_SERVICE_URL` |

All services also share `NODE_ENV`, `LOG_LEVEL`, and `OTEL_EXPORTER_OTLP_ENDPOINT`
(all optional, defaulted).

## Why boot-time, not import-time

Validation must run inside `main.ts`, not at module load, to respect the lazy
`getDb()` invariant in [`@autodidact/db`](../db/CLAUDE.md): the `pg.Pool` is built
at import time but only connects on the first query, so a boot-time `loadXEnv()`
gates before any real DB access. The provider factory
([`@autodidact/providers`](../providers)) keeps reading `process.env` directly —
`loadXEnv()` is the gate that guarantees those reads are valid.
