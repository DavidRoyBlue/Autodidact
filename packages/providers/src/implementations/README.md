# Implementations

Concrete provider classes. Each implements one interface from `../interfaces/`. Selected at runtime by the factory functions in `../factory.ts`.

## Directory Structure

```
implementations/
├── embedding/
│   ├── openai-embedding.provider.ts   # OpenAIEmbeddingProvider
│   └── cohere-embedding.provider.ts   # CohereEmbeddingProvider (stub)
├── queue/
│   ├── cloud-tasks.provider.ts    # CloudTasksQueueProvider
│   └── loopback.provider.ts       # LoopbackQueueProvider
└── auth/
    └── supabase-auth.provider.ts  # SupabaseAuthProvider
```

---

## Embedding Implementations

### `OpenAIEmbeddingProvider`
- **Library**: `@langchain/openai` — `OpenAIEmbeddings`
- **Default model**: `text-embedding-3-small`
- **Output dimensions**: 1536
- **Config**: `{ apiKey, model? }`

### `CohereEmbeddingProvider`
- **Status**: Stub — not production-ready. Returns empty arrays.
- **Activation**: Would be activated via `EMBEDDING_PROVIDER=cohere`
- Planned for Phase 3 (Roadmap).

---

## Queue Implementations

### `CloudTasksQueueProvider`
- **Library**: `@google-cloud/tasks` — `CloudTasksClient`
- **Config**: `{ projectId, location, workerBaseUrl, invokerServiceAccount, queuePrefix? }` (`queuePrefix` defaults to `autodidact-`)
- **Behaviour**: `enqueue(queue, name, data)` creates an HTTP task that POSTs the JSON payload to `${workerBaseUrl}/tasks/${name}` with an OIDC token; Cloud Run IAM authenticates it before it reaches the worker. Returns the created task name.
- **Retries**: queue-level Terraform config (`infra/modules/cloud-tasks`) — `EnqueueOptions.attempts/backoff` are ignored.
- **Activation**: `QUEUE_PROVIDER=cloudtasks` (production)

### `LoopbackQueueProvider`
- **Library**: none (global `fetch`)
- **Config**: `{ workerBaseUrl }` (default via `WORKER_TASK_BASE_URL`: `http://localhost:3002`)
- **Behaviour**: fire-and-forget POST straight to the worker's `/tasks/${name}` endpoint — the same contract Cloud Tasks uses, with no queue server. Single attempt; the worker treats it as the final attempt.
- **Activation**: `QUEUE_PROVIDER=loopback` (default — local dev and e2e)

---

## Auth Implementation

### `SupabaseAuthProvider`
- **Library**: `@supabase/supabase-js`
- **Config**: `{ supabaseUrl, serviceRoleKey }`
- **Verification**: `supabase.auth.getUser(token)` — validates JWT against Supabase's JWKS endpoint
- **Returns**: `AuthUser { id, supabaseId, email }` where `id` is the app user's UUID and `supabaseId` is the Supabase Auth UUID
