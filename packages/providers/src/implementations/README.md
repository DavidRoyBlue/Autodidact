# Implementations

Concrete provider classes. Each implements one interface from `../interfaces/`. Selected at runtime by the factory functions in `../factory.ts`.

## Directory Structure

```
implementations/
├── llm/
│   ├── openai.provider.ts         # OpenAILLMProvider
│   └── anthropic.provider.ts      # AnthropicLLMProvider
├── embedding/
│   ├── openai-embedding.provider.ts   # OpenAIEmbeddingProvider
│   └── cohere-embedding.provider.ts   # CohereEmbeddingProvider (stub)
├── queue/
│   ├── cloud-tasks.provider.ts    # CloudTasksQueueProvider
│   └── loopback.provider.ts       # LoopbackQueueProvider
├── auth/
│   └── supabase-auth.provider.ts  # SupabaseAuthProvider
└── checkpointer/
    ├── memory.provider.ts         # MemoryCheckpointerProvider
    └── postgres.provider.ts       # PostgresCheckpointerProvider
```

---

## LLM Implementations

### `OpenAILLMProvider`
- **Library**: `@langchain/openai` — `ChatOpenAI`
- **Default model**: `gpt-4o`
- **Temperature**: `0.7`
- **Config**: `{ apiKey, model?, temperature? }`

### `AnthropicLLMProvider`
- **Library**: `@langchain/anthropic` — `ChatAnthropic`
- **Default model**: `claude-opus-4-7`
- **Temperature**: `0.7`
- **Config**: `{ apiKey, model?, temperature? }`
- **Activation**: Set `LLM_PROVIDER=anthropic`

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

---

## Checkpointer Implementations

### `MemoryCheckpointerProvider`
- **Library**: `@langchain/langgraph` — `MemorySaver`
- **Persistence**: In-process only. Lost on service restart.
- **Use case**: Development and testing.
- **Thread isolation**: Multiple threads are isolated by `thread_id` key.

### `PostgresCheckpointerProvider`
- **Library**: `@langchain/langgraph-checkpoint-postgres` — `PostgresSaver`
- **Persistence**: Durable, survives service restarts and scales across instances.
- **Config**: `{ connectionString }` (the `DATABASE_URL`)
- **Initialisation**: Lazy async. The `PostgresSaver` instance calls `.setup()` (creates checkpoint tables) once on first use.
- **Activation**: Set `CHECKPOINTER=postgres`
- **Required for production**: `MemorySaver` causes conversation history loss on every deploy.
