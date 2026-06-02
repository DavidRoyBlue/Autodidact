# @autodidact/providers

## Purpose

Provider interfaces, implementations, and factory functions for all external vendor dependencies. The central abstraction that prevents any service from hard-coding a vendor choice.

## Consumers

| Consumer | Providers Used |
|----------|---------------|
| `services/api` | `IAuthProvider`, `IQueueProvider` |
| `services/agent` | `ILLMProvider`, `IEmbeddingProvider`, `ICheckpointerProvider` |
| `services/worker` | `IQueueProvider` |

## Public API

```typescript
import {
  // Factory functions (primary API)
  createLLMProvider,
  createEmbeddingProvider,
  createQueueProvider,
  createAuthProvider,
  createCheckpointer,

  // Interfaces (for type annotations)
  type ILLMProvider,
  type IEmbeddingProvider,
  type IQueueProvider,
  type IAuthProvider,
  type ICheckpointerProvider,

  // Config type
  type ProviderConfig,
} from '@autodidact/providers';
```

## Provider Configuration

All factory functions accept an optional `ProviderConfig` object. If a field is omitted, the factory reads the corresponding environment variable.

| Env var | Factory | Options | Default |
|---------|---------|---------|---------|
| `LLM_PROVIDER` | `createLLMProvider` | `openai`, `anthropic`, `mock` | `openai` |
| `EMBEDDING_PROVIDER` | `createEmbeddingProvider` | `openai`, `mock` | `openai` |
| `QUEUE_PROVIDER` | `createQueueProvider` | `bullmq` | `bullmq` |
| `AUTH_PROVIDER` | `createAuthProvider` | `supabase`, `mock` | `supabase` |
| `CHECKPOINTER` | `createCheckpointer` | `memory`, `postgres` | `memory` |

> `mock` (LLM/embedding/auth) selects deterministic, network-free providers used **only** by the cross-service e2e (`@autodidact/e2e`) — never in dev or production.

## Internal Structure

```
packages/providers/src/
├── factory.ts                        # All 5 factory functions
├── index.ts                          # Re-exports
├── interfaces/
│   ├── llm.ts                        # ILLMProvider
│   ├── embedding.ts                  # IEmbeddingProvider
│   ├── queue.ts                      # IQueueProvider
│   ├── auth.ts                       # IAuthProvider
│   └── checkpointer.ts               # ICheckpointerProvider
└── implementations/
    ├── llm/
    │   ├── openai.provider.ts         # ChatOpenAI (gpt-4o)
    │   └── anthropic.provider.ts      # ChatAnthropic (claude-opus-4-7)
    ├── embedding/
    │   ├── openai-embedding.provider.ts   # OpenAIEmbeddings (text-embedding-3-small)
    │   └── cohere-embedding.provider.ts   # Stub — not production-ready
    ├── queue/
    │   └── bullmq.provider.ts         # BullMQ + IORedis
    ├── auth/
    │   └── supabase-auth.provider.ts  # Supabase JWT verification
    └── checkpointer/
        ├── memory.provider.ts         # LangGraph MemorySaver
        └── postgres.provider.ts       # LangGraph PostgresSaver
```

## Usage Example

```typescript
// In service main.ts
const llmProvider = createLLMProvider({});   // reads LLM_PROVIDER env var
const model = llmProvider.getModel();         // BaseChatModel ready for LangChain

// Override for testing
const testProvider = createLLMProvider({ llmProvider: 'openai', openaiApiKey: 'test' });

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
- [ADR-006 — AI orchestration framework](../../docs/architecture/ADRs/services/agent/ADR-006-ai-orchestration-framework.md) (returns LangGraph types)
- [ADR-020 — Authentication strategy](../../docs/architecture/ADRs/cross-cutting/ADR-020-authentication-strategy.md) (auth provider — 🚩)
