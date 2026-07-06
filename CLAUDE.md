# Claude Project Instructions

> Planning, assumptions, and completion summaries scale with change size — trivial fixes don't need them.
> Path-scoped rules live in `.claude/rules/` (`db.md`, `testing.md`, `issues.md`) — they load automatically when you touch matching files. Subtree invariants live in nested `CLAUDE.md` files and win within their scope.

## Project overview

AI-powered learning platform. Three backend services plus an Expo mobile app in a pnpm + Turborepo monorepo.

| Layer | Package | Role |
|-------|---------|------|
| Public HTTP | `services/api` | NestJS — auth, courses, chat proxy, progress |
| AI runtime | `services/agent` | Fastify + LangGraph — all LLM and embedding calls (internal only, port 3001) |
| Background | `services/worker` | Fastify task handler — course generation and embedding tasks, invoked per-task by Cloud Tasks (prod) / loopback (dev) |
| Client | `apps/mobile` | Expo React Native — the only UI |

Shared packages: `packages/db` (Drizzle + pgvector), `packages/types`, `packages/schemas` (Zod), `packages/providers` (LLM/queue/auth abstractions), `packages/prompts`, `packages/observability` (pino + OTEL), `packages/config` (tsconfig, eslint, vitest bases).

## Commands

```bash
pnpm setup              # first-time: prereqs → install → .env.dev → supabase start → migrate → build
pnpm dev                # full backend stack: supabase start → build → migrate → all services (reads .env.dev)
pnpm mobile             # Expo dev server — separate terminal while dev is running
pnpm stop               # stop the local Supabase stack; Node services stop via Ctrl+C

pnpm build              # turbo build all packages and services
pnpm typecheck          # type-check all packages (triggers a build first)
pnpm lint               # lint all packages (--fix to auto-fix)
pnpm test               # all test suites (triggers a build first)
pnpm test <filter>      # tests for matching packages only (e.g. pnpm test api)
pnpm clean              # remove all build artifacts

pnpm migrate:dev        # run pending Drizzle migrations against the local stack DB (127.0.0.1:55322)
pnpm db:studio:dev      # Drizzle Studio at https://local.drizzle.studio (Supabase Studio: http://127.0.0.1:55323)
pnpm db:reset:dev       # DESTRUCTIVE: supabase db reset → re-apply all Drizzle migrations (local stack only)
```

## Environment

Copy `.env.example` → `.env.dev` (`pnpm setup` does this). Minimum required to boot:

| Var | Used by | Note |
|-----|---------|------|
| `DATABASE_URL` | api, agent, worker | Local dev: `127.0.0.1:55322` (direct). Cloud/prod from WSL2: transaction pooler URL (port 6543) |
| `SUPABASE_URL` | api | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | mobile | Also set in `apps/mobile/app.json` → `extra` |
| `SUPABASE_SECRET_KEY` | packages/db | Admin client — never expose to clients |
| `OPENAI_API_KEY` | agent | Default LLM and embedding provider |
| `AGENT_SERVICE_URL` | api, worker | Default: `http://localhost:3001` |

See `.env.example` for all vars and provider-swap options (`LLM_PROVIDER`, `CHECKPOINTER`, etc.).
New worktree: symlink env files from the main workspace —
`ln -sf $(git rev-parse --show-superproject-working-tree || git rev-parse --show-toplevel)/.env.dev .env.dev`

## Production & deployment

GCP (project `autodidact-494819`, `northamerica-northeast1`): Cloud Run ×3, Cloud Tasks, Artifact Registry, Secret Manager — Terraform IaC under `infra/`. Prod DB is hosted Supabase via its transaction pooler (port 6543).

- **Runbook:** [`docs/gcp_infra_setup.md`](docs/gcp_infra_setup.md) — read before touching prod infra.
- **Deploy:** promoting `master` → `production` (`git push origin master:production`) triggers `.github/workflows/deploy.yml` (CI → images → migrations → `gcloud run deploy`, via Workload Identity Federation). Pushing to `master` does **not** deploy; promotion is the human release gate.
- **Prod secrets:** `infra/secrets.env` is the single source (never committed). There is **no `.env.prod`**.
- **Prod DB tools** (sparingly — CI migrates on deploy): `pnpm migrate:prod`, `pnpm db:studio:prod` — prod DB operations run only via the `db-specialist` subagent, never the main conversation.
- Mobile prod target is selected by EAS build profiles in `apps/mobile/eas.json`; local `expo start` uses `.env.dev`.

## Core engineering values

1. **Test what you change.** Focused tests for new/changed behavior; test logic, not SDK calls or infrastructure wrappers. If a test isn't practical, say why and how you verified manually.
2. **Single source of truth.** Every fact, config, schema, and rule lives in exactly one authoritative place; reference it from elsewhere. (Documentation reference content is exempt — see Documentation.)
3. **Modular design.** Isolated responsibilities, clear interfaces, small modules.
4. **Mean and lean (hard constraint).** Minimum code that solves the problem. No speculative features or pre-emptive abstractions. Prefer SDK/library calls over custom implementations — custom code is yours to own forever. If you wrote 200 lines and it could be 50, rewrite it.
5. **Surgical changes.** Touch only what the task requires; no drive-by cleanup. Match existing style — unless it violates a nested `CLAUDE.md` invariant, which wins. Tests for code you're modifying are part of the change.

## Before you code

- State assumptions first. If multiple interpretations exist, name them — don't pick silently. If a simpler approach exists, push back. If success criteria are vague, ask for specifics.
- For multi-step tasks, state a brief plan with verifiable checkpoints: `[Step] → verify: [check]`.
- For non-trivial changes, read docs before editing: nearest `README.md` → parent READMEs → `docs/architecture/` → relevant ADRs. Don't guess conventions when documentation exists.

## Documentation

- Layers: root `README.md` = repo overview · `docs/architecture/` = system design · ADRs (`docs/architecture/ADRs/`) = durable decisions · folder `README.md` = human narrative/gotchas · nested `CLAUDE.md` = agent-binding subtree invariants · code comments = non-obvious behavior only. Link upward instead of duplicating; `docs/CLAUDE.md` owns the where-to-document map.
- Binding rules live authoritatively in `CLAUDE.md` files; READMEs may duplicate reference content (commands, maps) but never restate binding rules — they link.
- **Compounding:** if a change teaches the codebase something durable (architecture, boundaries, commands, env vars, contracts, gotchas), update the closest relevant doc. **Pruning:** docs that contradict code get fixed or deleted in the same change.
- When completing a task, state: what changed, what tests were added (or why none), what docs were read/updated.

## Code navigation (code-review-graph MCP)

Docs own intent and rules; the graph owns structure and topology. For non-trivial changes: **docs first, graph next, source last**.
Where is X? → `semantic_search_nodes` · what calls X / is X tested? → `query_graph` · blast radius? → `get_impact_radius`, `get_affected_flows` · start broad → `get_minimal_context`, `get_architecture_overview`. Workflow recipes live in the `.claude/skills/` graph skills. If the graph seems stale, run `code-review-graph status`.

## GitHub issues

Issue lifecycle is hook-automated (`.claude/hooks/issues-sync.mjs`; filename→issue map in `.claude/issue-map.json`).
**Hard rule: never close an issue or mark a parent done — the owner closes.** In PR bodies write "Part of #N", never `Closes #N`. Full lifecycle rules: `.claude/rules/issues.md` (loads with `docs/superpowers/**` files).
