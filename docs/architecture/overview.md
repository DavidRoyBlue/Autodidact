# Architecture

## High-Level Design

Autodidact uses a monorepo with separate applications, services, and shared packages.

## Request Flows

### Course Generation
```
Mobile → API (POST /courses) → Cloud Tasks → Worker (HTTP) → Agent service → LLM
                                                            → DB (Drizzle/Supabase)
                                                            → Cloud Tasks (embedding follow-up)
```

### Module Chat
```
Mobile → API (POST /chat/sessions/:id/stream) → Agent service (SSE) → Mobile
```

### Course Reuse
```
Mobile → API (POST /courses) → Agent /embeddings/text
                             → pgvector similarity search
                             → if similarity > 0.92: return existing course
                             → else: enqueue new generation job
```

## Layers

### Apps
- `apps/mobile` — Expo React Native app

### Services
- `services/api` — NestJS. Public-facing. Auth, course management, chat SSE proxy, progress.
- `services/agent` — Fastify. LangGraph graphs. Course generation and module chat.
- `services/worker` — HTTP task handler (Cloud Tasks). Async course generation and embedding.

### Packages
- `packages/providers` — Provider interfaces + implementations. The key abstraction layer.
- `packages/db` — Drizzle schema, client, migrations.
- `packages/types` — Shared TypeScript types.
- `packages/schemas` — Zod validation schemas.
- `packages/prompts` — AI prompt templates.
- `packages/config` — Shared TypeScript/ESLint/Prettier configs.
- `packages/observability` — Structured logging (pino) + OpenTelemetry tracing.

## Provider Abstraction

All external vendor dependencies (LLM, embeddings, queue, auth, checkpointer) are accessed through
interfaces defined in `packages/providers`. Provider selection is driven by environment variables,
not code changes. Swapping from OpenAI to Anthropic requires only a single env var change.

## Why This Structure

- Clear separation of concerns
- No vendor lock-in via provider abstraction
- Easier horizontal scaling per service
- Shared types/schemas prevent drift between services
- Production-ready boundaries from day one
