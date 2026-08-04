# Claude Project Instructions

> Planning, assumptions, and completion summaries scale with change size — trivial fixes don't need them.

---

## Project overview

AI-powered learning platform: three backend services (`services/api`, `services/agent`, `services/worker`) plus an Expo mobile app (`apps/mobile`) in a pnpm + Turborepo monorepo. Per-deployable/package description — status, stack, secrets, key files — lives in [`PRODUCTION.md`](PRODUCTION.md). Read the relevant section there before working on a deployable.

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

Copy `.env.example` → `.env.dev` (`pnpm setup` does this). `.env.example` documents every var and provider-swap option (`LLM_PROVIDER`, `CHECKPOINTER`, etc.); per-deployable secret locations are in `PRODUCTION.md`.

- WSL2: `DATABASE_URL` against hosted Supabase must be the transaction pooler URL (port 6543) — the direct host is IPv6-only and unreachable.
- Supabase key naming is `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` — never `ANON_KEY` / `SERVICE_ROLE_KEY`. Never expose the secret key to clients.

## New branch / worktree setup
When starting work in a new worktree, symlink env files from the main workspace:
ln -sf $(git rev-parse --show-superproject-working-tree || git rev-parse --show-toplevel)/.env.dev .env.dev

---

## Development workspace policy

The development workspace is owned by `workspace.yml`, `scripts/dev-workspace.sh`, and the Supabase CLI stack. Before starting any long-running development process:

1. Run `pnpm workspace` (or `./scripts/dev-workspace.sh --no-attach` from an agent) — it is idempotent: it reuses healthy services and restarts dead ones in their designated pane.
2. Inspect existing tmux and Docker state (`tmux list-panes -a -F '#S:#W.#P #{@ws_id}'`, `docker ps`) before launching anything yourself.
3. Never launch duplicate backend (`pnpm dev`), Expo/Metro, database, emulator, or watcher processes manually — each has exactly one designated pane in the `autodidact` session.
4. Never use alternate ports to bypass an existing process.
5. Short-lived commands (tests, lint, typecheck, builds, migrations, individual adb commands) may run independently.
6. Never modify, kill, or send commands to the `claude` window in the `autodidact` session, or any `ClaudeHUB` window, unless explicitly requested.

---

## Production & deployment

Prod shape (GCP project, Cloud Run services, queues, mobile build profiles) is described in `PRODUCTION.md`. Binding rules:

- **Read [`docs/gcp_infra_setup.md`](docs/gcp_infra_setup.md) before touching prod infra.**
- **Deploy gate:** only promoting `master` → the `production` branch (`git push origin master:production`) deploys, via `.github/workflows/deploy.yml`. Pushing to `master` does **not** deploy; PRs are validated by `.github/workflows/ci.yml`. Promotion to `production` is the human release gate — never do it unprompted.
- **Prod secrets:** `infra/secrets.env` is the single source (seeds Secret Manager via `scripts/gcp-bootstrap.sh`); never committed. There is **no `.env.prod`** — never create one.
- **Prod DB tools** (run locally, sparingly — CI already migrates on deploy): `pnpm migrate:prod`, `pnpm db:studio:prod` (both load `infra/secrets.env`).

---

## Core engineering values

Every code change must respect these:

1. **Test what you change.** Add or update focused tests for new or changed behavior. If a test isn't practical, explain why and describe how you verified it manually.
2. **Single source of truth.** Don't duplicate facts, config, schemas, business rules, or ownership info in code. Update the authoritative source; reference it from elsewhere.
3. **Modular design.** Isolated responsibilities, clear interfaces, small modules. Don't couple unrelated concerns to ship faster.
4. **Simplicity first.** Write the minimum code that solves the problem. No speculative features, no abstractions for single-use code, no "configurability" that wasn't asked for. If you wrote 200 lines and it could be 50, rewrite it.
5. **Surgical changes.** Touch only what the task requires. No drive-by cleanup of adjacent code, comments, or formatting. Match existing style — exception: if it violates an invariant stated in a nested `AGENTS.md`, the invariant wins. Remove only dead code your changes created, not pre-existing orphans. Tests for code you're modifying count as part of the change, not cleanup.

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
1. The relevant `PRODUCTION.md` section (what it is, stack, secrets, key files)
2. Nearest `AGENTS.md` (invariants and rules for the subtree)
3. Relevant `docs/architecture/` files if the change crosses boundaries
4. Relevant ADRs if the change touches a durable decision
5. Graph layer for structural navigation — locating implementations, tracing calls, assessing blast radius (see MCP Tools below)

Do not guess project conventions when documentation exists.

For trivial fixes, use judgment and avoid unnecessary context loading.

---

## Layered documentation model

- Root `README.md` = product/repo overview
- Root `PRODUCTION.md` = descriptive map — one section per deployable/package (status, stack, secrets, state, key files), each stamped `_verified: YYYY-MM-DD`
- `docs/architecture/` = system architecture, C4, infra, data model; `docs/architecture/ADRs/` = durable decisions and tradeoffs
- Nested `AGENTS.md` = **imperative only** — invariants, library rules, testing rules, commands (agent-binding)
- Folder `README.md` = only for genuinely local operational narrative (e.g. `scripts/`, `e2e/`, `issuekit/`); **no per-service READMEs** — their descriptive content belongs in `PRODUCTION.md`
- Code comments = non-obvious implementation details only

Link upward instead of duplicating.

**Descriptive vs imperative is the split that matters.** AGENTS.md loads into context on every agent run in its scope — descriptive content there is a tax on every run for something needed rarely. Keep AGENTS.md to conventions and constraints ("Drizzle is the sole migration authority, never `supabase migration`"); put "what this is / what it's built on / where things live" in `PRODUCTION.md`.

**Maintaining PRODUCTION.md:** when you change a deployable's stack, secrets location, or deploy shape, update its section and bump its `_verified:` date. When you re-verify a section is accurate, bump the date. Write `none`, not a sentence; no prose padding. Sections older than 30 days are flagged weekly by `.github/workflows/production-doc-freshness.yml`.

---

## Nested AGENTS.md

Every `AGENTS.md` (root and nested) has a sibling one-line `CLAUDE.md` shim
(`@AGENTS.md`). Edit the `AGENTS.md`, never the shim — CI and
`agents-drift-check` enforce this.

Subtree-specific behavior rules belong in nested `AGENTS.md` files.

Examples:
- `services/api/AGENTS.md`
- `packages/db/AGENTS.md`
- `apps/mobile/AGENTS.md`

Use nested `AGENTS.md` files for:
- local invariants
- library choices
- verification commands (tests, typecheck, lint)
- testing rules
- source-of-truth declarations
- anything an agent must always respect in that subtree

Nested rules extend this root file and narrow it within their subtree — a nested invariant is more specific than a root rule and wins within its scope.

---

## Where to document

- Deployable/package description (status, stack, secrets, key files) → its `PRODUCTION.md` section
- Subtree invariant, library rule, testing rule, verification command → nearest `AGENTS.md`
- System-wide relationship → `docs/architecture/`
- Durable decision/tradeoff → ADR
- HTTP/task contracts → the code (controllers, routes, schemas) is the source of truth; don't maintain parallel endpoint docs
- Local operational workflow (scripts, e2e harness) → that folder's `README.md`
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
- a deployable's stack/secrets/deploy shape → its `PRODUCTION.md` section (+ bump `_verified:`)

Do not update docs for trivial refactors or obvious implementation details.

---

## Pruning rule

If documentation contradicts current code, fix or delete the stale documentation in the same change. Stale docs are worse than missing docs.

---

## Doc style

Short, factual, specific; link upward instead of duplicating. In `PRODUCTION.md`, keep every section to the shared template headings in the same order — the file must stay greppable and scriptable.

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

**Doc layer** (`AGENTS.md` files, `PRODUCTION.md`, `docs/architecture/`) owns **intent, rules, and decisions**: what invariants apply, why things were built a certain way, what tradeoffs were made.

**Graph layer** (code-review-graph MCP tools) owns **structure and topology**: where code lives, what calls what, blast radius of a change. The graph carries no rules or intent — it can tell you *that* X calls Y, not *why*.

Most tasks need both: read relevant docs first to absorb rules and context, then use the graph for structural navigation.

**What each layer answers:**

| Question | Layer | Where |
|----------|-------|-------|
| What invariants apply here? What must not be broken? | Doc | Nearest `AGENTS.md` → parent `AGENTS.md` |
| Why was X built this way? What tradeoffs were made? | Doc | `docs/architecture/decisions/` (ADRs) |
| How does the system work at a high level? | Doc | `docs/architecture/overview.md` |
| Where is X implemented? | Graph | `semantic_search_nodes` |
| What calls X? What does X depend on? | Graph | `query_graph` |
| What will break if I change X? | Graph | `get_impact_radius`, `get_affected_flows` |
| Is X covered by tests? | Graph | `query_graph` pattern="tests_for" |
| Broad boundary map | Both | `get_architecture_overview` → `docs/architecture/` for depth |
| Reviewing a diff | Both | Nearest `AGENTS.md` for applicable invariants → `detect_changes` + `get_review_context` |

Use Grep/Glob/Read as a fallback for **code** when the graph doesn't have the answer — not as a substitute for reading doc files directly.

### Order of operations

For non-trivial changes (extends Documentation-first and Before you code):

1. **Docs first** — `PRODUCTION.md` section, ADRs, nearest `AGENTS.md`.
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

The issue system is implemented in `issuekit/` — rules live in `issuekit/rules.json`; run
`node issuekit/cli.mjs --help`. Plan/spec files under `docs/superpowers/` are mirrored to an
issue tree by the Write hook (sidecar `.claude/issue-map.json`; never write an `**Issue:**`
field into files); declare hierarchy with `**Parent:** <parent-filename.md>` in the file body.
Freeform sessions are tied to an issue at first prompt (`.claude/hooks/first-prompt-issue.mjs`)
and recorded at Stop (`session-issues.mjs`); server-side workflows enforce the rules
(registered in `automations/`). Do not manually create issues or edit labels — the hook and
folder location handle status.

**Hard rule — the owner closes, never Claude.** Never close an issue or set board Status to
`Done`. When your part is done: `gh issue edit #N --add-label in-review --remove-label
in-progress` and leave it open (never on a parent with open sub-issues — it stays
`in-progress` until the owner closes its children). Write "Part of #N" in PR bodies, never
"Closes #N".
