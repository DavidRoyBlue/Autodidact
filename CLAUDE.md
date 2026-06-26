# Claude Project Instructions

> Planning, assumptions, and completion summaries scale with change size — trivial fixes don't need them.

---

## Project overview

AI-powered learning platform. Three backend services plus an Expo mobile app in a pnpm + Turborepo monorepo.

| Layer | Package | Role |
|-------|---------|------|
| Public HTTP | `services/api` | NestJS — auth, courses, chat proxy, progress |
| AI runtime | `services/agent` | Fastify + LangGraph — all LLM and embedding calls (internal only, port 3001) |
| Background | `services/worker` | Fastify task handler — course generation and embedding tasks, invoked per-task by Cloud Tasks (prod) / loopback (dev) |
| Client | `apps/mobile` | Expo React Native — the only UI |

Shared packages: `packages/db` (Drizzle + pgvector), `packages/types`, `packages/schemas` (Zod), `packages/providers` (LLM/queue/auth abstractions), `packages/prompts`, `packages/observability` (pino + OTEL), `packages/config` (tsconfig, eslint, vitest bases).

---

## Commands

```bash
pnpm setup              # first-time: checks prereqs → installs deps → copies .env.example → .env.dev → starts the Supabase stack (supabase start) → migrates → builds
pnpm dev                # full backend stack: starts the Supabase stack (supabase start) → builds → migrates → all services (reads .env.dev)
pnpm mobile             # Expo dev server — run in a separate terminal while dev is running
pnpm stop               # stops the local Supabase stack (supabase stop); Node services stop via Ctrl+C in their terminal

pnpm build              # turbo build all packages and services
pnpm typecheck          # type-check all packages (triggers a build first)
pnpm lint               # lint all packages
pnpm lint --fix         # lint and auto-fix violations
pnpm test               # run all test suites (triggers a build first)
pnpm test <filter>      # run tests for matching packages only (e.g. pnpm test api, pnpm test agent)
pnpm clean              # remove all build artifacts

pnpm migrate:dev        # run pending Drizzle migrations against the local stack DB (127.0.0.1:55322)
pnpm db:generate:dev    # generate a new migration from schema changes — review the SQL before committing
pnpm db:studio:dev      # open Drizzle Studio at https://local.drizzle.studio (Supabase Studio also at http://127.0.0.1:55323)
pnpm db:reset:dev       # DESTRUCTIVE: supabase db reset → re-apply all Drizzle migrations from scratch (local stack only)
```

---

## Environment

Copy `.env.example` → `.env.dev` (`pnpm setup` does this). Minimum required to boot:

| Var | Used by | Note |
|-----|---------|------|
| `DATABASE_URL` | api, agent, worker | WSL2: must be transaction pooler URL (port 6543) |
| `SUPABASE_URL` | api | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | mobile | Also set in `apps/mobile/app.json` → `extra` |
| `SUPABASE_SECRET_KEY` | packages/db | Admin client — never expose to clients |
| `OPENAI_API_KEY` | agent | Default LLM and embedding provider |
| `AGENT_SERVICE_URL` | api, worker | Default: `http://localhost:3001` |

See `.env.example` for all vars and provider-swap options (`LLM_PROVIDER`, `CHECKPOINTER`, etc.).

## New branch / worktree setup
When starting work in a new worktree, symlink env files from the main workspace:
ln -sf $(git rev-parse --show-superproject-working-tree || git rev-parse --show-toplevel)/.env.dev .env.dev

---

## Production & deployment

Production runs on **GCP** (project `autodidact-494819`, region `northamerica-northeast1`): Cloud Run ×3 (api public, agent internal, worker scale-to-zero), Cloud Tasks queues, Artifact Registry, and GCP Secret Manager — all defined as Terraform IaC under `infra/` (remote state in GCS). The hosted prod DB is the Supabase project reached via its transaction pooler (port 6543).

- **Full setup runbook:** [`docs/gcp_infra_setup.md`](docs/gcp_infra_setup.md) — GCP bootstrap, Terraform apply, Secret Manager, Workload Identity Federation. Read this before touching prod infra.
- **Deploy:** push to `master` → `.github/workflows/deploy.yml` builds the three images, runs DB migrations, and `gcloud run deploy`s — authenticated via Workload Identity Federation (no key files). No manual step for an ordinary release.
- **Prod secrets:** `infra/secrets.env` is the single source (seeds Secret Manager via `scripts/gcp-bootstrap.sh`); never committed. There is **no `.env.prod`**.
- **Prod DB tools** (run locally, sparingly — CI already migrates on deploy):

```bash
pnpm migrate:prod       # apply pending Drizzle migrations to the prod DB (loads infra/secrets.env)
pnpm db:studio:prod     # open Drizzle Studio against the prod DB (loads infra/secrets.env)
```

The mobile app's prod target (Cloud Run API + hosted Supabase) is selected by EAS build profiles in `apps/mobile/eas.json`; local `expo start` uses `.env.dev`.

---

## Core engineering values

Every code change must respect these:

1. **Test what you change.** Add or update focused tests for new or changed behavior. If a test isn't practical, explain why and describe how you verified it manually.
2. **Single source of truth.** Don't duplicate facts, config, schemas, business rules, or ownership info in code. Update the authoritative source; reference it from elsewhere. (Documentation reference content is exempt — see Authority: README vs CLAUDE.md.)
3. **Modular design.** Isolated responsibilities, clear interfaces, small modules. Don't couple unrelated concerns to ship faster.
4. **Simplicity first.** Write the minimum code that solves the problem. No speculative features, no abstractions for single-use code, no "configurability" that wasn't asked for. If you wrote 200 lines and it could be 50, rewrite it.
5. **Surgical changes.** Touch only what the task requires. No drive-by cleanup of adjacent code, comments, or formatting. Match existing style — exception: if it violates an invariant stated in a nested `CLAUDE.md`, the invariant wins. Remove only dead code your changes created, not pre-existing orphans. Tests for code you're modifying count as part of the change, not cleanup.

---

## Mean and lean (hard constraint)
- Implement the minimum code that satisfies the requirement. No pre-emptive abstractions.
- Prefer SDK and library calls over custom implementations — they are maintained externally; custom code is yours to own forever.
- Test logic, not SDK calls or infrastructure wrappers.
- No docs updates unless something is genuinely non-obvious to a future reader.
- No placeholder comments for unimplemented future specs.
- Being lean is our core advantage. Always prioritize concise code/librairy/sdk over costum implementation.

## Before you code

State assumptions before implementing. If uncertain, ask:

- If multiple interpretations exist, name them — don't pick silently.
- If a simpler approach is available, say so and push back when warranted.
- If something is unclear, stop, name what's confusing, ask before proceeding.
- If success criteria are vague ("make it work"), ask for specifics.

For multi-step tasks, state a brief plan with verifiable checkpoints:

1. [Step] → verify: [check]
2. [Step] → verify: [check]

---

## Documentation-first rule

For non-trivial changes, read existing docs before editing.

Start with:
1. Nearest relevant `README.md`
2. Parent `README.md` files, up to 2 levels up
3. Relevant `docs/architecture/` files if the change crosses boundaries
4. Relevant ADRs if the change touches a durable decision
5. Graph layer for structural navigation — locating implementations, tracing calls, assessing blast radius (see MCP Tools below)

Do not guess project conventions when documentation exists.

For trivial fixes, use judgment and avoid unnecessary context loading.

---

## Layered documentation model

- Root `README.md` = product/repo overview
- `docs/architecture/` = system architecture, C4, infra, data model
- `docs/architecture/decisions/` = durable decisions and tradeoffs
- Folder `README.md` = local narrative, ownership, workflows, gotchas (human-facing)
- Nested `CLAUDE.md` = subtree invariants, source-of-truth, agent rules (agent-binding)
- Code comments = non-obvious implementation details only

Higher-level docs explain broad context. Lower-level docs explain local implementation details. Link upward instead of duplicating.

---

## Authority: README vs CLAUDE.md

Both files coexist in many folders. They serve different audiences and may overlap on reference content — that's fine.

**Binding rules need a single source of truth.** Imperative rules ("must use X," "must not Y," invariants) live authoritatively in `CLAUDE.md`. README does not restate them — if relevant to humans, link to `CLAUDE.md`.

**Reference content can appear in both.** Source-of-truth maps, component relationships, file locations, commands — duplicate freely. Both audiences benefit from self-contained files, and drift in pointer data is obvious when it happens.

**Audience split for narrative:**
- Narrative purpose, ownership, gotchas, onboarding → README
- Agent-binding rules, invariants, testing rules → `CLAUDE.md`

Each file cross-links to its pair at the top.

---

## Nested CLAUDE.md

Subtree-specific behavior rules belong in nested `CLAUDE.md` files.

Examples:
- `services/api/CLAUDE.md`
- `packages/db/CLAUDE.md`
- `apps/mobile/CLAUDE.md`

Use nested `CLAUDE.md` files for:
- local invariants
- library choices
- verification commands (tests, typecheck, lint)
- testing rules
- source-of-truth declarations
- anything an agent must always respect in that subtree

Nested rules extend this root file and narrow it within their subtree — a nested invariant is more specific than a root rule and wins within its scope.

---

## Where to document

- Local implementation detail → nearest folder `README.md`
- Service/package responsibility → service/package `README.md`
- Cross-boundary contract → README of the lowest common ancestor folder
- System-wide relationship → `docs/architecture/`
- Durable decision/tradeoff → ADR
- Verification commands (tests, typecheck, lint) → nearest `CLAUDE.md`
- Broader workflows → nearest README, plus root README if globally relevant
- Non-obvious code behavior → code comment

---

## Compounding rule

After meaningful changes, ask:

> Did this change teach the codebase something future agents or developers need to know?

If yes, update the closest relevant doc.

Update docs for changes to:
- architecture
- ownership/boundaries
- commands/workflows
- environment variables
- source-of-truth rules
- integration contracts
- recurring gotchas
- testing strategy
- future agent behavior

Do not update docs for trivial refactors or obvious implementation details.

---

## Pruning rule

If documentation contradicts current code, fix or delete the stale documentation in the same change. Stale docs are worse than missing docs.

---

## README style

Keep README updates short, factual, specific, and link upward instead of duplicating.

---

## Final response expectation

When completing a task, mention:
1. What code changed
2. What tests were added or updated (or why none were needed)
3. What docs were read
4. Whether docs were updated, and if not, why

---

## MCP Tools: code-review-graph

Structural knowledge graph (Tree-sitter + SQLite, MCP-exposed) tracking imports, calls, inheritance, tests, and execution flows. Use for code-structure questions before scanning files.

Two complementary layers with distinct domains — neither substitutes for the other.

**Doc layer** (`CLAUDE.md` files, READMEs, `docs/architecture/`) owns **intent, rules, and decisions**: what invariants apply, why things were built a certain way, what tradeoffs were made.

**Graph layer** (code-review-graph MCP tools) owns **structure and topology**: where code lives, what calls what, blast radius of a change. The graph carries no rules or intent — it can tell you *that* X calls Y, not *why*.

Most tasks need both: read relevant docs first to absorb rules and context, then use the graph for structural navigation.

**What each layer answers:**

| Question | Layer | Where |
|----------|-------|-------|
| What invariants apply here? What must not be broken? | Doc | Nearest `CLAUDE.md` → parent `CLAUDE.md` |
| Why was X built this way? What tradeoffs were made? | Doc | `docs/architecture/decisions/` (ADRs) |
| How does the system work at a high level? | Doc | `docs/architecture/overview.md` |
| Where is X implemented? | Graph | `semantic_search_nodes` |
| What calls X? What does X depend on? | Graph | `query_graph` |
| What will break if I change X? | Graph | `get_impact_radius`, `get_affected_flows` |
| Is X covered by tests? | Graph | `query_graph` pattern="tests_for" |
| Broad boundary map | Both | `get_architecture_overview` → `docs/architecture/` for depth |
| Reviewing a diff | Both | Nearest `CLAUDE.md` for applicable invariants → `detect_changes` + `get_review_context` |

Use Grep/Glob/Read as a fallback for **code** when the graph doesn't have the answer — not as a substitute for reading doc files directly.

### Order of operations

For non-trivial changes (extends Documentation-first and Before you code):

1. **Docs first** — READMEs, ADRs, nearest `CLAUDE.md`.
2. **Graph next** — start with `get_minimal_context` (~100 tokens), then drill in.
3. **Source last** — read implementation only after the graph narrows where.

The graph gives structure, not implementation. Read source for what code actually does, and for non-code files (configs, markdown, scripts).

### Tools

**Explore** — `get_minimal_context` (start here), `get_architecture_overview`, `list_communities` / `get_community`, `semantic_search_nodes`, `query_graph` (callers_of / callees_of / imports_of / tests_for), `traverse_graph`, `find_large_functions`

**Analyze changes** — `detect_changes` (risk-scored diff), `get_review_context` (compact snippets), `get_impact_radius`, `get_affected_flows`, `list_flows` / `get_flow`

**Architecture & quality** — `get_hub_nodes` (hotspots), `get_bridge_nodes` (chokepoints), `get_surprising_connections`, `get_knowledge_gaps`, `get_suggested_questions`

**Refactor** — `refactor_tool` (preview), `apply_refactor_tool`

**Document** — `generate_wiki` (drafts from community structure), `get_wiki_page`

### Workflows

- **Code review** (Surgical changes, v5): `detect_changes` → `get_impact_radius` → `get_review_context` → `query_graph` tests_for.
- **Bug**: `semantic_search_nodes` → `query_graph` callers_of → `get_affected_flows` → read source.
- **New feature** (Modular design, v3): `get_architecture_overview` → `list_communities` → `semantic_search_nodes` for patterns → mirror existing.
- **Refactor** (Simplicity, v4): `refactor_tool` preview → `query_graph` callers_of → `get_impact_radius` → `apply_refactor_tool`.
- **Doc pass** (Compounding rule): `get_architecture_overview` → `get_hub_nodes` → `get_knowledge_gaps` → `list_communities` → `generate_wiki` to draft.

### Maintenance

Hooks auto-update on edit/commit. If stale, run `code-review-graph status`; re-run install if hooks aren't firing.

## GitHub Issues

Issue creation and labelling are automated by `.claude/hooks/issues-sync.mjs`. The filename→issue
link lives in `.claude/issue-map.json` — never write an `**Issue:**` field into files.

### When creating a spec or plan that belongs to a parent
Add `**Parent:** <parent-filename.md>` to the file body alongside `**Date:**`, before writing.
The hook resolves that filename to the parent issue and sets the sub-issue relationship. Use the
parent's filename, not an issue number.

### When all checkboxes in a plan file are checked off
1. Look up the plan's issue number in `.claude/issue-map.json` (keyed by filename).
2. Close it: `gh issue close #N -c "All tasks complete."`
3. If the plan has a parent and every sibling plan under it is also closed, close the parent too.
4. Include `Closes #N` in the PR body for the deepest relevant issue (the plan, not the spec).

Do not manually create issues, edit labels, or close issues on folder moves — the hook and the
folder location handle status.
