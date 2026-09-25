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
Mobile → API (POST /chat/sessions/:id/stream) → AgentPlatform (course-teacher run per turn, ADR-031) → API (SSE) → Mobile
                                               → Agent service (/embeddings/text, RAG query grounding)
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
- `services/api` — NestJS. Public-facing. Auth, course management, runs the module teacher on AgentPlatform per turn and streams the reply to the client, progress.
- `services/agent` — Fastify. Embeddings only; no graph, checkpointer, or LLM call (course generation moved to AgentPlatform under ADR-030, module teaching under ADR-031).
- `services/worker` — HTTP task handler (Cloud Tasks). Async course generation (a run on AgentPlatform) and embedding.

### Packages
- `packages/providers` — Provider interfaces + implementations. The key abstraction layer.
- `packages/db` — Drizzle schema, client, migrations.
- `packages/types` — Shared TypeScript types.
- `packages/schemas` — Zod validation schemas.
- `packages/config` — Shared TypeScript/ESLint/Prettier configs.
- `packages/observability` — Structured logging (pino) + OpenTelemetry tracing.

## Provider Abstraction

External vendor dependencies (embeddings, queue, auth) are accessed through interfaces defined in
`packages/providers`, selected by environment variables rather than code changes. The same package
still declares `ILLMProvider` and `ICheckpointerProvider`, but no service calls them since ADR-031
moved the module teacher to AgentPlatform — removing that unused layer is a follow-up, not done yet.

## Why This Structure

- Clear separation of concerns
- No vendor lock-in via provider abstraction
- Easier horizontal scaling per service
- Shared types/schemas prevent drift between services
- Production-ready boundaries from day one
