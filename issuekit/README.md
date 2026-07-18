# issuekit

The repo's GitHub issue system: one codebase, one config. Plan/spec files under
`docs/superpowers/` are mirrored to a GitHub issue tree (create / label / nest), and
server-side workflows enforce the tree's integrity. Every rule lives in
[`rules.json`](rules.json) — **that file is the single source of truth**; nothing here or in
CLAUDE.md restates a rule it owns.

## Layout

| Path | Role |
|---|---|
| `rules.json` | THE config: label taxonomy, label flow, board mapping, integrity rules, watched paths |
| `cli.mjs` | Single entrypoint — `node issuekit/cli.mjs --help` |
| `lib/gh.mjs` | All GitHub interaction (gh CLI + GraphQL) |
| `lib/files.mjs` | Plan-file logic: which files get issues, title/body/label/parent extraction |
| `lib/map.mjs` | The sidecar `.claude/issue-map.json` (filename → `{ issue, parent }`) |
| `lib/sync.mjs` | Mirroring: single-file (hook) and full-tree (backfill) share one core |
| `lib/checks.mjs` | Enforcement rules: `parent-close`, `board-sync` |
| `lib/labels.mjs` | `labels --ensure` — reconcile repo labels with `rules.json` |

## What reads `rules.json`

- **`labels`** + **`flow`** — the label taxonomy and its state machine. `flow.closeAuthority:
  "owner"` is the system's hard rule: agents hand off with `flow.handoffLabel` and never close.
- **`plans`** — which folders are watched and the folder → label snapshot taken at creation
  (the folder itself stays the live status SSOT, per `docs/superpowers/CLAUDE.md`).
- **`board`** — Projects V2 mapping: project number, Status field, label → column, forward-only
  movement, terminal status.
- **`integrity`** — parent/child rules enforced server-side.

## How it's invoked

| Trigger | Caller | Command |
|---|---|---|
| Claude Code `Write` hook (PostToolUse) | `.claude/settings.json` | `cli.mjs sync` (hook payload on stdin) |
| GH issue closed | `.github/workflows/parent-close-guard.yml` | `cli.mjs check parent-close --issue N --fix` |
| GH issue opened/labeled/reopened | `.github/workflows/project-status-sync.yml` | `cli.mjs check board-sync --issue N --fix` |
| Manual (setup / repair) | you | `cli.mjs labels --ensure`, `cli.mjs sync [--dry-run]` |

The session hooks (`.claude/hooks/first-prompt-issue.mjs`, `session-issues.mjs`) import
`lib/gh.mjs` and `lib/files.mjs` so sub-issue linking and file detection are implemented once.
Every automation is registered in [`automations/`](../automations/).

`check` subcommands run locally for debugging: without `--fix` they only detect
(exit 0 pass, 1 violation); with `--fix` they apply the remedy.

## Tests

```bash
node --test 'issuekit/**/*.test.mjs'
```

Pure logic only (file parsing, map round-trip, board state machine) — GitHub calls are not
mocked or tested, per repo testing values.

## Portability

Designed for later extraction to its own repo: all repo-specific values (project number, paths,
labels) live in `rules.json`; the repo/owner is derived from the git remote at runtime. Callers
are thin (a hook line, ~20-line workflows), matching the reusable-workflow pattern.

## Migration notes (2026-07-18)

Consolidated from `.claude/hooks/issues-sync.mjs`, `.claude/hooks/lib/issues.mjs`,
`.claude/hooks/backfill-issues.mjs`, and inline YAML in the two enforcement workflows.
Behavior preserved, with these deliberate exceptions:

- `plan-in-action/` was dropped from the status folders — the directory never existed.
- `in-review` is now declared in `rules.json` and created by `labels --ensure` — it was
  referenced by CLAUDE.md and the board sync but never bootstrapped.
- `claude-auto-issue-triage.yml` and its `scripts/gh.sh` / `scripts/edit-issue-labels.sh`
  were deleted — nearly all issues come from plan files, so it triaged a stream that
  barely exists.
- TODO (pre-existing, preserved as-is): files created directly in `_done/` get the `ready`
  label before being immediately closed — harmless but arguably mislabeled.
- TODO (pre-existing, preserved as-is): `board-sync` seeds a card only when a flow label is
  present; an issue with no `ready`/`in-progress`/`in-review` label never reaches the board
  automatically.
- `labels --ensure` creates missing labels but does not reconcile an existing label's
  color/description (the GitHub-side `in-progress` description still mentions the removed
  `plan-in-action/` folder — cosmetic only).
