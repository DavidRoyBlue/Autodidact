# @autodidact/providers

## Purpose

Provider interfaces, implementations, and factory functions for external vendor dependencies. The central abstraction that prevents any service from hard-coding a vendor choice.

## Consumers

| Consumer | Providers Used |
|----------|---------------|
| `services/api` | `IAuthProvider`, `IQueueProvider` |
| `services/agent` | `IEmbeddingProvider` |
| `services/worker` | `IQueueProvider` |

## Public API

```typescript
import {
  // Factory functions (primary API)
  createEmbeddingProvider,
  createQueueProvider,
  createAuthProvider,

  // Interfaces (for type annotations)
  type IEmbeddingProvider,
  type IQueueProvider,
  type IAuthProvider,

  // Config type
  type ProviderConfig,
} from '@autodidact/providers';
```

## Provider Configuration

All factory functions accept an optional `ProviderConfig` object. If a field is omitted, the factory reads the corresponding environment variable.

| Env var | Factory | Options | Default |
|---------|---------|---------|---------|
| `EMBEDDING_PROVIDER` | `createEmbeddingProvider` | `openai`, `mock` | `openai` |
| `QUEUE_PROVIDER` | `createQueueProvider` | `loopback`, `cloudtasks` | `loopback` |
| `AUTH_PROVIDER` | `createAuthProvider` | `supabase`, `mock` | `supabase` |

> `mock` (embedding/auth) selects deterministic, network-free providers used **only** by the cross-service e2e (`@autodidact/e2e`) — never in dev or production.
>
> `cloudtasks` additionally reads `GCP_PROJECT_ID`, `CLOUD_TASKS_LOCATION`, `WORKER_TASK_BASE_URL`, and `CLOUD_TASKS_INVOKER_SA`; `loopback` reads `WORKER_TASK_BASE_URL` (default `http://localhost:3002`). Retry/backoff is queue-level config (Terraform), so `EnqueueOptions.attempts/backoff` are advisory and ignored.

## Internal Structure

```
packages/providers/src/
├── factory.ts                        # All 3 factory functions
├── index.ts                          # Re-exports
├── interfaces/
│   ├── embedding.ts                  # IEmbeddingProvider
│   ├── queue.ts                      # IQueueProvider
│   └── auth.ts                       # IAuthProvider
└── implementations/
    ├── embedding/
    │   ├── openai-embedding.provider.ts   # OpenAIEmbeddings (text-embedding-3-small)
    │   └── cohere-embedding.provider.ts   # Stub — not production-ready
    ├── queue/
    │   ├── cloud-tasks.provider.ts    # GCP Cloud Tasks (prod)
    │   └── loopback.provider.ts       # Direct HTTP POST to the worker (dev)
    └── auth/
        └── supabase-auth.provider.ts  # Supabase JWT verification
```

## Usage Example

```typescript
// In service main.ts
const embeddingProvider = createEmbeddingProvider({});  // reads EMBEDDING_PROVIDER env var
const vector = await embeddingProvider.embed(text);

// Override for testing
const testProvider = createEmbeddingProvider({ embeddingProvider: 'mock' });

// In NestJS DI (API service)
{
  provide: QUEUE_PROVIDER_TOKEN,
  useFactory: () => createQueueProvider(),
}
```

## Adding a New Provider

1. Create `src/implementations/<category>/<name>.provider.ts` implementing the relevant interface.
2. Add the `if (provider === '<name>') return new NewProvider(...)` branch in `factory.ts`.
3. Add the env var option to the README table above.
4. No changes required in any service.

See also:
- [Interfaces](src/interfaces/README.md)
- [Implementations](src/implementations/README.md)

## Key Decisions

- [ADR-009 — External vendor abstraction](../../docs/architecture/ADRs/packages/providers/ADR-009-external-vendor-abstraction.md)
- [ADR-020 — Authentication strategy](../../docs/architecture/ADRs/cross-cutting/ADR-020-authentication-strategy.md) (auth provider — 🚩)
- [ADR-031 — Module teacher on AgentPlatform](../../docs/architecture/ADRs/cross-cutting/ADR-031-module-teacher-on-agent-platform.md) (LLM and checkpointer providers removed; the module teacher runs on AgentPlatform)
