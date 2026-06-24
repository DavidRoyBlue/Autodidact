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
- NativeWind v4 + React Native Reusables
- TanStack Query
- Zustand

### Backend
- NestJS (API)
- LangGraph TS (Agent)
- Cloud Tasks task handler (Worker)

### Data
- Supabase PostgreSQL
- Drizzle ORM
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

# 4. For local access to the prod DB, populate infra/secrets.env (the same file
#    that seeds GCP Secret Manager). Prod runtime secrets come from Secret Manager.

# 5. Start all services in dev mode
#    Boots the local Supabase stack (supabase start: API 55321, DB 55322,
#    Studio 55323), applies Drizzle migrations, then starts the services.
#    After the first `supabase start`, copy the Publishable + Secret keys from
#    `pnpm exec supabase status` into .env.dev. `pnpm stop` stops the stack.
pnpm dev

# 6. Run env-specific DB commands as needed
pnpm migrate:dev
pnpm db:studio:dev        # Drizzle Studio; Supabase Studio at http://127.0.0.1:55323
```

> **Env loading.** Services validate their environment at boot via `@autodidact/env`
> and fail fast with a clear message if a required variable is missing. With direnv
> (step 3) `.env.dev` is loaded for *every* command in this directory. There is no
> `.env.prod`: the prod-DB wrappers (`migrate:prod`, `db:studio:prod`) select
> `infra/secrets.env` explicitly via `dotenv -e`, overriding direnv in their
> subprocess. Production **runtime** secrets are not read from any local file —
> Cloud Run injects them from GCP Secret Manager (seeded from `infra/secrets.env`).

## Provider Configuration

Two provider switches are wired to code today — set them in the environment, no code change needed to swap:

| Variable | Options | Default |
|----------|---------|---------|
| `LLM_PROVIDER` | `openai`, `anthropic` | `openai` |
| `CHECKPOINTER` | `memory`, `postgres` | `memory` |

The provider-factory pattern (`packages/providers`) is designed to host more
switches — `EMBEDDING_PROVIDER`, `QUEUE_PROVIDER`, `AUTH_PROVIDER` are reserved
names but **not yet wired**: each factory currently hardcodes its single
implemented option and ignores the env var. They live under "RESERVED" in
`.env.example` so the template doesn't advertise behavior the code lacks.

## Deploying

**Backend.** Production runs on GCP Cloud Run and deploys automatically on push to
`master` (`.github/workflows/deploy.yml`): the pipeline gates on lint/typecheck/test,
builds the three service images, runs DB migrations, then `gcloud run deploy`s each
service. For first-time infra setup, Terraform, secrets, and running prod DB
migrations, see the [GCP setup runbook](docs/gcp_infra_setup.md).

**Mobile.** The Expo app is built and released with EAS (`apps/mobile/eas.json`),
which defines three profiles: `development` (dev client → local backend), `preview`
(internal APK → prod Cloud Run API), and `production` (Play Store AAB → prod Cloud
Run API). The backend URL and Supabase keys are injected per profile and resolved at
runtime via `apps/mobile/app.config.ts`. See
[`apps/mobile/README.md`](apps/mobile/README.md) for build and run details.

## Documentation

- [Architecture](docs/architecture/overview.md)
- [GCP / production setup](docs/gcp_infra_setup.md)
- [Stack decisions](docs/stack.md)
- [Product vision](docs/product.md)
- [Roadmap](docs/roadmap.md)

## Status

MVP build complete. Production-first architecture.

## License

Private project.
