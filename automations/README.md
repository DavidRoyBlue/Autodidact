# Automations registry

Every automation tied to this repo gets an entry here **before it ships**. An automation is
anything that fires without a human running it by hand: a GitHub workflow, a Claude Code hook,
a scheduled agent, an external trigger.

## The trigger-ownership rule

**Automation logic lives where its trigger fires, but implementation lives in one shared
codebase.**

- GitHub-event triggers (issue closed, PR opened, cron) → **repo workflows** (`.github/workflows/`).
- Human/local triggers (a tool call in a session, a prompt) → **hooks** (`.claude/hooks/`,
  `.claude/settings.json`) or external tools (CommandCenter, harness).

An automation is registered here if its trigger fires *in or on this repo*. Callers stay thin
(a hook line, ~20-line workflow); rules and behavior live in one implementation the caller
invokes (e.g. `issuekit/`). No rule implemented twice, no logic in YAML.

## Entry template

One file may hold multiple related entries (e.g. `issue-triage.md` holds the whole issue
system).

```markdown
# <Automation name>

| Field | Value |
|---|---|
| Trigger | <event that fires it, e.g. "GH issue closed" / "CC Write hook on plans/**"> |
| Trigger owner | <repo workflow / local hook / CommandCenter / harness> |
| Implementation | <path, e.g. issuekit/cli.mjs check parent-close> |
| Invoked by | <workflow file / hook config> |
| Side effects | <what it creates/modifies> |
| Failure mode | <what happens if it doesn't run> |

## Notes
<anything else>
```

## Index

| Automation | Trigger | Trigger owner | Entry |
|---|---|---|---|
| Plan-file → issue sync | CC `Write` hook | local hook | [issue-triage.md](issue-triage.md) |
| Session→issue tie | CC first prompt | local hook | [issue-triage.md](issue-triage.md) |
| Session record | CC session Stop | local hook | [issue-triage.md](issue-triage.md) |
| Parent close guard | GH issue closed | repo workflow | [issue-triage.md](issue-triage.md) |
| Board status sync | GH issue opened/labeled/reopened | repo workflow | [issue-triage.md](issue-triage.md) |
| Label bootstrap | manual (setup) | human via issuekit CLI | [issue-triage.md](issue-triage.md) |
| Code-graph update / status | CC Edit/Write/Bash hook; session start | local hook | pre-dates registry — `code-review-graph` (AGENTS.md § MCP Tools) |
| Plan-review suggestion | CC `Write` hook | local hook | pre-dates registry — `.claude/hooks/suggest-plan-review.sh` |
| CI validation | GH pull request | repo workflow | pre-dates registry — `.github/workflows/ci.yml` |
| Deploy | GH push to `production` | repo workflow | pre-dates registry — `.github/workflows/deploy.yml` (docs/gcp_infra_setup.md) |
| @claude assistant | GH comments/mentions | repo workflow | pre-dates registry — `.github/workflows/claude.yml` |
| Claude PR reviews | GH pull request | repo workflow | pre-dates registry — `claude-code-review.yml`, `claude-pr-review.yml` |
| API doc sync check | GH PR touching `services/api/**` | repo workflow | pre-dates registry — `claude-api-sync-documentation.yml` |
| Doc sync check | GH pull request | repo workflow | pre-dates registry — `doc-sync-check.yml` |
| ADR review | GH cron (monthly) + ADR PRs | repo workflow | pre-dates registry — `adr-review.yml` |
| Weekly maintenance | GH cron (weekly) | repo workflow | pre-dates registry — `claude-weekly-maintenance.yml` |
| Nightly checks | GH cron (daily) | repo workflow | pre-dates registry — `nightly.yml` |

Pre-registry automations get a full entry file the next time they're meaningfully changed.
