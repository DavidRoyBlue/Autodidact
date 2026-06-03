# Autodidact

AI-native learning platform that generates structured courses and teaches them through module-based conversations.

## Features

- Generate courses from any subject request
- Learn one module at a time through AI chat
- Track module completion and progress
- Reuse cached course blueprints via semantic similarity
- Mobile-first experience
- Provider-agnostic architecture (swap LLM/embedding/queue/auth via env vars)

## Tech Stack

### Frontend
- Expo + React Native + TypeScript
- Expo Router
- TanStack Query
- Zustand

### Backend
- NestJS (API)
- LangGraph TS (Agent)
- BullMQ (Worker)

### Data
- Supabase PostgreSQL
- Drizzle ORM
- Redis
- pgvector

### Infra
- Google Cloud Run
- GitHub Actions
- Artifact Registry
- Terraform

## Project Structure

```
autodidact/
├── apps/
│   └── mobile/
├── services/
│   ├── api/
│   ├── agent/
│   └── worker/
├── packages/
│   ├── providers/     ← provider interfaces + factory (no vendor lock-in)
│   ├── db/
│   ├── env/           ← typed, fail-fast env validation (boot-time)
│   ├── schemas/
│   ├── prompts/
│   ├── types/
│   ├── config/
│   └── observability/
├── infra/
└── docs/
```

## Getting Started

```bash
# 1. Install dependencies
pnpm install

# 2. Create local dev env vars
cp .env.example .env.dev

# 3. (Recommended) Load env automatically with direnv
#    Without this, only `pnpm dev` / migrate:* / db:* load env (via dotenv-cli).
#    With it, every command — build, test, single-service runs — gets a real env.
cp .envrc.example .envrc && direnv allow   # requires direnv (https://direnv.net)

# 4. Create .env.prod manually when you need production access

# 5. Start all services in dev mode
pnpm dev

# 6. Run env-specific DB commands as needed
pnpm migrate:dev
pnpm db:studio:dev
```

## Provider Configuration

Provider selection is driven by environment variables — no code changes needed to swap:

| Variable | Options | Default |
|----------|---------|---------|
| `LLM_PROVIDER` | `openai`, `anthropic` | `openai` |
| `EMBEDDING_PROVIDER` | `openai` | `openai` |
| `QUEUE_PROVIDER` | `bullmq` | `bullmq` |
| `AUTH_PROVIDER` | `supabase` | `supabase` |
| `CHECKPOINTER` | `memory`, `postgres` | `memory` |

## Documentation

- [Architecture](docs/architecture/overview.md)
- [Stack decisions](docs/stack.md)
- [Product vision](docs/product.md)
- [Roadmap](docs/roadmap.md)

## Status

MVP build complete. Production-first architecture.

## License

Private project.
