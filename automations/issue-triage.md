# Issue system (issuekit)

All entries share one implementation (`issuekit/`, rules in `issuekit/rules.json`) — see
`issuekit/README.md`.

# Plan-file → issue sync

| Field | Value |
|---|---|
| Trigger | CC `Write` hook (PostToolUse) on `docs/superpowers/**` status folders |
| Trigger owner | local hook |
| Implementation | `issuekit/cli.mjs sync` (`issuekit/lib/sync.mjs`) |
| Invoked by | `.claude/settings.json` → PostToolUse `Write` |
| Side effects | Creates/adopts a GitHub issue, applies folder label, links `**Parent:**` sub-issue, writes + stages `.claude/issue-map.json` |
| Failure mode | File gets no issue; repaired anytime by running `cli.mjs sync` standalone (idempotent tree scan) |

## Notes
Never blocks the session (always exits 0 in hook mode). Adopt-by-title makes a lost map
harmless (spec D10).

# Session→issue tie

| Field | Value |
|---|---|
| Trigger | First substantive prompt of a CC session (UserPromptSubmit) |
| Trigger owner | local hook |
| Implementation | `.claude/hooks/first-prompt-issue.mjs` (+ `lib/classify.mjs`, `lib/session-tie.mjs`; gh calls via `issuekit/lib/gh.mjs`) |
| Invoked by | `.claude/settings.json` → UserPromptSubmit |
| Side effects | Ties session to a referenced open issue, or creates a new (sub-)issue labeled `in-progress`; tie stored in OS tmpdir |
| Failure mode | Session untracked until Stop; the Stop hook falls back to its own classification |

# Session record

| Field | Value |
|---|---|
| Trigger | CC session Stop |
| Trigger owner | local hook |
| Implementation | `.claude/hooks/session-issues.mjs` (+ `lib/transcript.mjs`; gh calls via `issuekit/lib/gh.mjs`) |
| Invoked by | `.claude/settings.json` → Stop |
| Side effects | Creates a born-closed "Session: …" issue nested under the tied/closest open issue |
| Failure mode | No session record; nothing else breaks |

## Notes
Skips sessions that wrote a superpowers file (the Write hook already made their issue).
Recursion-guarded against its own nested `claude -p` call.

# Parent close guard

| Field | Value |
|---|---|
| Trigger | GH issue closed |
| Trigger owner | repo workflow |
| Implementation | `issuekit/cli.mjs check parent-close --fix` (`issuekit/lib/checks.mjs`) |
| Invoked by | `.github/workflows/parent-close-guard.yml` |
| Side effects | Reopens an issue closed with open sub-issues and comments why |
| Failure mode | A parent can be closed while children are open — the board misreports until someone notices |

# Board status sync

| Field | Value |
|---|---|
| Trigger | GH issue opened / labeled / reopened |
| Trigger owner | repo workflow |
| Implementation | `issuekit/cli.mjs check board-sync --fix` (`issuekit/lib/checks.mjs`) |
| Invoked by | `.github/workflows/project-status-sync.yml` (needs `PROJECT_PAT` secret; no-ops without it) |
| Side effects | Adds the issue to Project #4 and advances its Status (forward-only, never off Done) |
| Failure mode | Board falls behind labels; self-heals on the issue's next open/label/reopen event, or run the check locally with `--fix` |

# Label bootstrap

| Field | Value |
|---|---|
| Trigger | manual — setup or after editing `rules.json` labels |
| Trigger owner | human via issuekit CLI |
| Implementation | `issuekit/cli.mjs labels --ensure` (`issuekit/lib/labels.mjs`) |
| Invoked by | you |
| Side effects | Creates any labels declared in `rules.json` missing on the repo |
| Failure mode | A declared label doesn't exist; `gh issue edit --add-label` and board sync misbehave for it |
