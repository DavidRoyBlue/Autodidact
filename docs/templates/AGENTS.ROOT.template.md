# Claude Project Instructions

> Root agent-binding rules for this repository. Nested `AGENTS.md` files extend and narrow these within their subtree.
> Pair file: [`../README.md`](../README.md) — product/repo overview for humans.
> Fill in applicable sections. Delete sections with no meaningful content — a short focused file beats a complete empty one.

> Planning, assumptions, and completion summaries scale with change size — trivial fixes don't need them.

---

## Project overview

One-paragraph elevator pitch. Then a layer/package map.

| Layer | Package | Role |
|-------|---------|------|
| <e.g. Public HTTP> | `services/...` | ... |
| <e.g. Background> | `services/...` | ... |
| <e.g. Client> | `apps/...` | ... |

Shared packages: `packages/<name>` (what it owns), ...

---

## Commands

Only commands an agent needs to run. Keep grouped by purpose. Remove groups that don't apply.

```bash
<setup command>        # first-time setup
<dev command>          # run the app/services locally
<stop command>         # stop infra (if applicable)

<build command>        # build all packages
<typecheck command>    # type-check
<lint command>         # lint
<lint --fix command>   # auto-fix
<test command>         # run all tests
<test filter command>  # run a subset
<clean command>        # remove build artifacts

<migrate command>      # apply pending DB migrations (if applicable)
<generate command>     # generate new migration from schema diff
<studio command>       # open DB UI
<reset command>        # DESTRUCTIVE: wipe and recreate local DB
```

---

## Environment

Copy `.env.example` → `.env.<env>`. Minimum required to boot:

| Var | Used by | Note |
|-----|---------|------|
| `EXAMPLE_VAR` | <service/package> | <constraint, format, gotcha> |

See `.env.example` for all vars and provider-swap options.

---

## Core engineering values

Every code change must respect these. Edit/extend to fit the project, but keep the spirit.

1. **Test what you change.** Add or update focused tests for new or changed behavior. If a test isn't practical, explain why and describe how you verified it manually.
2. **Single source of truth.** Don't duplicate facts, config, schemas, business rules, or ownership info in code. Update the authoritative source; reference it from elsewhere. (Documentation reference content is exempt — see Authority: README vs AGENTS.md.)
3. **Modular design.** Isolated responsibilities, clear interfaces, small modules. Don't couple unrelated concerns to ship faster.
4. **Simplicity first.** Write the minimum code that solves the problem. No speculative features, no abstractions for single-use code, no "configurability" that wasn't asked for. If you wrote 200 lines and it could be 50, rewrite it.
5. **Surgical changes.** Touch only what the task requires. No drive-by cleanup of adjacent code, comments, or formatting. Match existing style — exception: if it violates an invariant stated in a nested `AGENTS.md`, the invariant wins. Remove only dead code your changes created, not pre-existing orphans. Tests for code you're modifying count as part of the change, not cleanup.

---

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
5. <Structural navigation tool, if any — e.g. code graph MCP, ctags, language server>

Do not guess project conventions when documentation exists.

For trivial fixes, use judgment and avoid unnecessary context loading.

---

## Layered documentation model

- Root `README.md` = product/repo overview
- `docs/architecture/` = system architecture, C4, infra, data model
- `docs/architecture/decisions/` = durable decisions and tradeoffs (ADRs)
- Folder `README.md` = local narrative, ownership, workflows, gotchas (human-facing)
- Nested `AGENTS.md` = subtree invariants, source-of-truth, agent rules (agent-binding)
- Code comments = non-obvious implementation details only

Higher-level docs explain broad context. Lower-level docs explain local implementation details. Link upward instead of duplicating.

---

## Authority: README vs AGENTS.md

Both files coexist in many folders. They serve different audiences and may overlap on reference content — that's fine.

**Binding rules need a single source of truth.** Imperative rules ("must use X," "must not Y," invariants) live authoritatively in `AGENTS.md`. README does not restate them — if relevant to humans, link to `AGENTS.md`.

**Reference content can appear in both.** Source-of-truth maps, component relationships, file locations, commands — duplicate freely. Both audiences benefit from self-contained files, and drift in pointer data is obvious when it happens.

**Audience split for narrative:**
- Narrative purpose, ownership, gotchas, onboarding → README
- Agent-binding rules, invariants, testing rules → `AGENTS.md`

Each file cross-links to its pair at the top.

---

## Nested AGENTS.md

Subtree-specific behavior rules belong in nested `AGENTS.md` files.

Examples:
- `services/<name>/AGENTS.md`
- `packages/<name>/AGENTS.md`
- `apps/<name>/AGENTS.md`

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

- Local implementation detail → nearest folder `README.md`
- Service/package responsibility → service/package `README.md`
- Cross-boundary contract → README of the lowest common ancestor folder
- System-wide relationship → `docs/architecture/`
- Durable decision/tradeoff → ADR
- Verification commands (tests, typecheck, lint) → nearest `AGENTS.md`
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

## MCP / structural-navigation tools

Delete this section entirely if the project has no graph/structural tool. Otherwise describe:

- **What it is**: <one-line summary — e.g. "Tree-sitter-backed structural knowledge graph exposed via MCP">.
- **When to use it**: structure questions (where is X, what calls Y, blast radius of Z) before scanning files.

Two complementary layers with distinct domains — neither substitutes for the other.

**Doc layer** (`AGENTS.md`, READMEs, `docs/architecture/`) owns **intent, rules, and decisions**: what invariants apply, why things were built a certain way, what tradeoffs were made.

**Structural layer** (<tool name>) owns **structure and topology**: where code lives, what calls what, blast radius of a change. The structural layer carries no rules or intent — it can tell you *that* X calls Y, not *why*.

Most tasks need both: read relevant docs first to absorb rules and context, then use the structural tool for navigation.

### What each layer answers

| Question | Layer | Where |
|----------|-------|-------|
| What invariants apply here? What must not be broken? | Doc | Nearest `AGENTS.md` → parent `AGENTS.md` |
| Why was X built this way? What tradeoffs were made? | Doc | `docs/architecture/decisions/` (ADRs) |
| How does the system work at a high level? | Doc | `docs/architecture/overview.md` |
| Where is X implemented? | Structural | <tool/command> |
| What calls X? What does X depend on? | Structural | <tool/command> |
| What will break if I change X? | Structural | <tool/command> |
| Is X covered by tests? | Structural | <tool/command> |
| Broad boundary map | Both | <tool> → `docs/architecture/` for depth |
| Reviewing a diff | Both | Nearest `AGENTS.md` for invariants → <tool> for impact |

Use Grep/Glob/Read as a fallback for **code** when the structural tool doesn't have the answer — not as a substitute for reading doc files directly.

### Order of operations

For non-trivial changes (extends Documentation-first and Before you code):

1. **Docs first** — READMEs, ADRs, nearest `AGENTS.md`.
2. **Structural tool next** — start with a minimal-context query, then drill in.
3. **Source last** — read implementation only after structure has narrowed where.

The structural layer gives topology, not implementation. Read source for what code actually does, and for non-code files (configs, markdown, scripts).

### Tools / commands

List the actual tool calls or CLI commands the agent should use, grouped by purpose (explore, analyze changes, refactor, document). Delete groups that don't apply.

### Maintenance

How the index/graph is kept in sync (hooks, watch mode, manual rebuild). Include the staleness check command.
