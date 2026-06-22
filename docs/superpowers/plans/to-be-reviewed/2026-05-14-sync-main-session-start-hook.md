# Plan: SessionStart hook to sync local default branch with origin

> Date: 2026-05-14. Status: Proposed.

## Context

When a Claude Code session starts in this repo, the local default branch (`master` here, not `main`) silently drifts behind `origin`. The drift bites in two places:

1. Branches cut from a stale `master` start one or more merges behind without anyone noticing until PR-time conflicts.
2. Worktrees fan out from the main checkout. Each new worktree branches from whatever `master` happens to be at the moment of creation, propagating the staleness across feature branches.

The goal is to keep the local default branch fresh **passively** at session start, without ever interfering with feature-branch work or blocking startup. The repo uses `git worktree` heavily (current worktrees: `.claude/worktrees/plan-review-smoke`, `.worktrees/ui-enabled`, main checkout on `master`), so any `git pull`-style strategy is wrong — it would FF-merge `origin/master` into whatever branch the worktree happens to be on.

This hook resolves that by separating **fetch** (always safe everywhere) from **FF-merge** (only when the current checkout is on the default branch with a clean tree).

## Architecture decision: script in `.claude/hooks/`, not inline

**Decision:** dedicated bash script at `.claude/hooks/sync-default-branch.sh`. Registered in `.claude/settings.json` via `"type": "command"` pointing at the script path.

**Reasoning:**
- The logic has ~7 decision branches (source filter → repo check → default-branch detection with two fallbacks → fetch → branch check → cleanliness → ahead/diverged/FF). Inline as a one-liner it would be unreadable and impossible to test in isolation.
- The two existing hooks (`suggest-plan-review.sh`, `enforce-planner-isolation.sh`) are both bash scripts under `.claude/hooks/`. Convention is set.
- Scripts are testable in isolation by piping fake event JSON into stdin and asserting on stdout / exit code — see test cases below.

## Decisions to surface

### Source filter

**Decision:** fire on `source=startup` and `source=resume`; skip `source=clear`.

**Reasoning:** `/clear` is intra-session context reset. The user is still in the same shell, same working tree, and we already fetched at `startup` or `resume` earlier in this session. Re-fetching on every `/clear` is gratuitous network and gratuitous noise if it happens to find new commits. `startup` covers cold starts; `resume` covers picking up a stored conversation hours/days later, when staleness is most likely.

### Default branch detection

**Decision:** three-tier detection, in this order:

1. `git symbolic-ref --quiet --short refs/remotes/origin/HEAD` — instant, no network. Strip leading `origin/` to get the branch name.
2. If unset (the case in this repo today), call `git remote set-head origin --auto` (offline-safe; fails silently if no network), then retry step 1.
3. If still unset, try `refs/remotes/origin/main` then `refs/remotes/origin/master` via `git show-ref --verify --quiet`.

If all three fail, bail silently — we have no idea what to sync.

**Reasoning:** symbolic-ref is the canonical answer when cached. `set-head --auto` is the canonical way to populate it from the remote. The `main`/`master` fallback handles the case where the network is down on first run before set-head can populate; ordering `main` first because that's the modern norm, but the lookup is verified against the actual remote ref so we never invent a branch.

### Cleanliness check

**Decision:** treat the working tree as **clean** iff `git status --porcelain` produces no output. This counts modified tracked, staged, and untracked as **dirty**. Stashes are **ignored** (orthogonal to FF safety). Submodules are not specially handled (this repo doesn't use them).

**Reasoning:**
- `git merge --ff-only` itself only blocks on tracked/staged conflicts, not untracked. But the hook's job is broader: if the user has untracked WIP, we don't know what it is, and silently mutating their checked-out branch under them is hostile. Conservative wins.
- Stashes live outside the index/working tree and don't interact with FF — including them in the check would be a false positive.

### Failure handling

| Condition | Behavior |
|---|---|
| Not inside a git repo (`cwd` may be anywhere) | Exit 0, silent. |
| `source` is `clear` (or anything other than `startup`/`resume`) | Exit 0, silent. |
| Default branch undetectable after all three fallbacks | Exit 0, silent. |
| `git fetch` fails (offline, auth, slow network past timeout) | Exit 0, silent. |
| Current checkout is not on the default branch (worktree on feature / detached HEAD) | Fetch already happened. Exit 0, silent. |
| On default branch but dirty, **and** origin is ahead | One-line stdout notice: `sync-default: on master but working tree dirty — fetched only (origin is N commits ahead)`. Exit 0. |
| On default branch but dirty, origin not ahead | Exit 0, silent. |
| On default branch, clean, FF possible, ahead by N | `git merge --ff-only`. One-line stdout notice on success: `sync-default: fast-forwarded master by N commits`. Exit 0. |
| On default branch, clean, **diverged** (local has commits origin doesn't, not FF-able) | One-line stdout warning: `sync-default: master has diverged from origin/master — manual reconcile required (no merge attempted)`. Exit 0. |

**Reasoning:** The hook must never block CC startup. Every branch either exits 0 silently or prints a single informational line and exits 0. There is no path that exits non-zero.

### Output channel

**Decision:** **plain stdout, single line.** Not stderr. Not `additionalContext` JSON.

**Reasoning:**
- Claude Code SessionStart hooks render plain-text stdout in the transcript and also surface it as additional context to the model. For a one-line "fast-forwarded master by 3 commits", this is exactly what we want: the user sees it, and the model gets a small, useful situational hint that the base branch moved (relevant if the user then asks the model to do anything branch-aware).
- `additionalContext` via JSON `hookSpecificOutput` is the right tool for *substantive* context injection (file lists, system status). For a single-line tooling notice it's overkill and harder to read.
- `stderr` is semantically tempting (informational, non-blocking) but CC's rendering of SessionStart stderr varies and risks invisibility. stdout is reliably surfaced.
- The model-context cost is negligible: silent in the common case (already up to date), one short line on the rare "actually moved" case.

### `set -euo pipefail` vs `set -uo pipefail`

**Decision:** `set -uo pipefail` (no `-e`). Each external command's failure is handled explicitly with `|| true` or guarded `if`.

**Reasoning:** with `-e`, a `git rev-list --count` that fails on a missing ref would abort the whole hook before we got a chance to interpret the failure. We need fine-grained control over which failures are silent and which surface a message.

## Script content

Path: `.claude/hooks/sync-default-branch.sh`. Permissions: `0755` (matching the two existing hook scripts).

```bash
#!/usr/bin/env bash
# SessionStart hook: keep the local default branch in sync with origin.
#
# - Always fetches origin (safe in worktrees and on feature branches).
# - Fast-forwards the local default branch only when:
#     1. the current checkout is on it (we're in the main checkout, not a worktree)
#     2. the working tree is clean (no tracked, staged, or untracked changes)
#     3. origin/<default> is strictly ahead of local
# - Never blocks CC startup: every code path exits 0.
# - Quiet by default; one stdout line only when something material happened.

set -uo pipefail

# ---- 1. Parse the event payload ---------------------------------------------
event_json="$(cat)"
source_kind="$(jq -r '.source // "startup"' <<<"$event_json" 2>/dev/null || echo startup)"

case "$source_kind" in
  startup|resume) ;;
  *) exit 0 ;;
esac

# ---- 2. Bail if cwd is not in a git repo ------------------------------------
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# ---- 3. Detect the default branch -------------------------------------------
default_branch=""

if ref="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"; then
  default_branch="${ref#origin/}"
fi

if [[ -z "$default_branch" ]]; then
  # Populate origin/HEAD from the remote. Offline-safe.
  git remote set-head origin --auto >/dev/null 2>&1 || true
  if ref="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"; then
    default_branch="${ref#origin/}"
  fi
fi

if [[ -z "$default_branch" ]]; then
  for name in main master; do
    if git show-ref --verify --quiet "refs/remotes/origin/$name"; then
      default_branch="$name"
      break
    fi
  done
fi

[[ -n "$default_branch" ]] || exit 0

# ---- 4. Fetch (always, with a hard timeout) ---------------------------------
if command -v timeout >/dev/null 2>&1; then
  timeout 10 git fetch --quiet origin 2>/dev/null || exit 0
else
  git fetch --quiet origin 2>/dev/null || exit 0
fi

# ---- 5. Are we on the default branch? ---------------------------------------
current_branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
if [[ "$current_branch" != "$default_branch" ]]; then
  exit 0  # Worktree on feature branch, or detached HEAD. Fetch was enough.
fi

# ---- 6. Cleanliness check ---------------------------------------------------
ahead_by="$(git rev-list --count "HEAD..origin/$default_branch" 2>/dev/null || echo 0)"

if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  if [[ "${ahead_by:-0}" != "0" ]]; then
    printf 'sync-default: on %s but working tree dirty — fetched only (origin is %s commits ahead)\n' \
      "$default_branch" "$ahead_by"
  fi
  exit 0
fi

# ---- 7. Already up to date? --------------------------------------------------
if [[ "${ahead_by:-0}" == "0" ]]; then
  exit 0
fi

# ---- 8. FF-ability: HEAD must be an ancestor of origin/<default> ------------
if ! git merge-base --is-ancestor HEAD "origin/$default_branch" 2>/dev/null; then
  printf 'sync-default: %s has diverged from origin/%s — manual reconcile required (no merge attempted)\n' \
    "$default_branch" "$default_branch"
  exit 0
fi

# ---- 9. Fast-forward ---------------------------------------------------------
if git merge --ff-only --quiet "origin/$default_branch" 2>/dev/null; then
  printf 'sync-default: fast-forwarded %s by %s commits\n' "$default_branch" "$ahead_by"
fi
exit 0
```

## `settings.json` registration (merged with existing hooks)

The existing `SessionStart` block already contains `code-review-graph status`. We append a second hook entry inside the same matcher object — hooks under one matcher run in parallel, so ordering doesn't matter and there's no interference between the two.

The full merged `.claude/settings.json` after the change:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "code-review-graph update --skip-flows",
            "timeout": 30
          }
        ]
      },
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/suggest-plan-review.sh"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "code-review-graph status",
            "timeout": 10
          },
          {
            "type": "command",
            "command": ".claude/hooks/sync-default-branch.sh",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

Notes on the registration:
- `timeout: 15` is defense-in-depth on top of the in-script `timeout 10 git fetch` — the inner timeout fires first on slow fetches and exits 0 silently; the outer one is a hard ceiling in case anything else hangs.
- We do **not** touch the `PostToolUse` block or the `enforce-planner-isolation.sh` attachment (which lives in subagent frontmatter, not in this settings file).
- No changes to `.claude/settings.local.json`.

## Test plan

### Unit-ish: synthetic event JSON against the script

Each case below pipes a JSON line into the script and asserts on stdout + exit code. Run from a throwaway repo created in `/tmp/sync-test/` (with a fake `origin` remote pointing at a bare repo, also in `/tmp`).

| # | Setup | stdin | Expected stdout | Expected exit |
|---|---|---|---|---|
| 1 | `cwd` outside any git repo (`cd /tmp && mkdir empty && cd empty`) | `{"source":"startup"}` | (empty) | 0 |
| 2 | Real repo, on `master`, clean, origin up to date | `{"source":"clear"}` | (empty); no fetch invoked | 0 |
| 3 | Repo where `origin/HEAD` unset and neither `main` nor `master` exists on origin | `{"source":"startup"}` | (empty) | 0 |
| 4 | On `master`, clean, origin not ahead | `{"source":"startup"}` | (empty) | 0 |
| 5 | On `master`, clean, origin ahead by 3 | `{"source":"startup"}` | `sync-default: fast-forwarded master by 3 commits` | 0 |
| 6 | On `master`, dirty (one untracked file), origin ahead by 2 | `{"source":"startup"}` | `sync-default: on master but working tree dirty — fetched only (origin is 2 commits ahead)` | 0 |
| 7 | On `master`, dirty, origin not ahead | `{"source":"startup"}` | (empty) | 0 |
| 8 | Detached HEAD at `origin/master`'s tip | `{"source":"resume"}` | (empty) | 0 |
| 9 | On feature branch `foo` (simulating a worktree) | `{"source":"startup"}` | (empty) | 0 |
| 10 | On `master`, clean, local has 1 commit origin doesn't (diverged) | `{"source":"startup"}` | `sync-default: master has diverged from origin/master — manual reconcile required (no merge attempted)` | 0 |
| 11 | Network sabotaged (point `origin` URL at `http://127.0.0.1:1` or unset HOME so git auth fails) | `{"source":"startup"}` | (empty) | 0 |
| 12 | `origin/HEAD` unset locally but `git remote set-head origin --auto` succeeds and reveals `master` | `{"source":"startup"}` | depends on ahead state; never errors | 0 |

A small bash test runner can be dropped at `scripts/test-sync-default-branch.sh` (out of scope for this hook plan, but worth noting as a follow-up if regressions become a concern).

### Integration: real CC sessions

These are manual smoke tests. Each should be re-run after any future change to the hook.

1. **Main checkout, on `master`, clean, master fresh** — start CC at `/home/bkd/Projects/Autodidact`. Expect no sync line in transcript. `git fetch` should have been called (verify via `.git/FETCH_HEAD` mtime).
2. **Main checkout, on `master`, clean, origin ahead** — first force-push an extra commit to `origin/master` from another clone or use a sandbox remote. Start CC. Expect one stdout line `sync-default: fast-forwarded master by N commits`. Verify `git log master` shows the new commit.
3. **Main checkout, on `master`, dirty, origin ahead** — `touch wip.txt`, then start CC. Expect `sync-default: on master but working tree dirty — fetched only ...`. Verify `master` ref is unchanged.
4. **Worktree on feature branch** — start CC at `.claude/worktrees/plan-review-smoke`. Expect no sync line. Verify `git fetch` ran. Verify `master` in main checkout is unchanged (because hook ran from a worktree, not from a checkout of master).
5. **Worktree on feature branch with origin/master ahead** — same as above. Confirm the hook did NOT attempt `git fetch origin master:master` or any other path that would fail because master is checked out elsewhere.
6. **WSL with network down** — `sudo ip link set eth0 down` (or block via firewall), start CC. Expect no sync line, no error, no startup delay beyond the 10s inner timeout.
7. **CC opened outside any git repo** — `cd /tmp && claude`. Expect no sync line and no error.
8. **Fresh clone with `origin/HEAD` unset** — `git clone <url> /tmp/fresh && cd /tmp/fresh && git symbolic-ref --delete refs/remotes/origin/HEAD 2>/dev/null`, then start CC. Expect the `set-head --auto` fallback to populate it; hook behaves normally.
9. **`/clear` mid-session** — start CC, run a few turns, then `/clear`. Expect no new sync line (filtered) and no fetch (verify via `.git/FETCH_HEAD` mtime).
10. **Diverged `master`** — make a local commit on master that isn't on origin. Start CC. Expect the "diverged" warning line; no merge attempted.

### Verification commands

After installing the hook:

```bash
# Confirm the script is executable and well-formed
bash -n /home/bkd/Projects/Autodidact/.claude/hooks/sync-default-branch.sh
ls -l /home/bkd/Projects/Autodidact/.claude/hooks/sync-default-branch.sh   # expect -rwxr-xr-x

# Confirm settings.json is valid JSON and contains both hooks
jq '.hooks.SessionStart[0].hooks | length' /home/bkd/Projects/Autodidact/.claude/settings.json
# expect: 2

# Dry-run the script in isolation (from the main checkout)
printf '{"source":"startup"}' | /home/bkd/Projects/Autodidact/.claude/hooks/sync-default-branch.sh
# expect: empty stdout if already in sync, or one of the documented one-liners

# Dry-run from a worktree
cd /home/bkd/Projects/Autodidact/.claude/worktrees/plan-review-smoke
printf '{"source":"startup"}' | /home/bkd/Projects/Autodidact/.claude/hooks/sync-default-branch.sh
# expect: empty stdout (fetch only)
```

## Edge case decisions

- **Worktree on the default branch.** Possible if someone deliberately checks out `master` in a worktree (and not in the main checkout). The hook handles this transparently: the worktree IS the current checkout of `master`, so the FF runs there. The main-checkout-as-worktree assumption doesn't matter — what matters is "am I the checkout that owns this branch right now?" which `git symbolic-ref HEAD` answers correctly.
- **Two CC sessions starting simultaneously in different worktrees.** Both run the hook. Both call `git fetch origin` concurrently — git serializes via the lock on `.git/FETCH_HEAD`, slightly slower but correct. Neither attempts to FF (both on feature branches), so no race on the `master` ref.
- **CC session in a non-git directory inside the repo path.** `git rev-parse --is-inside-work-tree` returns false from outside the worktree (e.g. starting CC at `/home/bkd/Projects` directly). Exit 0 silent.
- **`origin` doesn't exist.** All three default-branch detection paths fail. Exit 0 silent. We don't try other remote names — single-remote `origin` is the universal convention for this repo and the user explicitly scoped the spec to `origin`.
- **`origin` is a fork, `upstream` is canonical.** Out of scope; the spec was scoped to `origin`. If needed later, a `SYNC_DEFAULT_REMOTE` env var is the obvious extension point.
- **Submodules.** Not used in this repo. If introduced, the cleanliness check would flag dirty submodule pointers as "dirty," which is the safe default. No special handling needed unless we want to recurse — out of scope.
- **Hooks under same matcher run in parallel.** Confirmed by Claude Code hook docs. `code-review-graph status` and `sync-default-branch.sh` can interleave their stdout — both produce minimal output, so interleaving is acceptable. If it becomes a problem, hoist one into a separate matcher entry (still under `SessionStart`).
- **`jq` is required by the script.** Already required by the two existing hooks; confirmed present on this host via the working `enforce-planner-isolation.sh`.

## Files to change / create

| Path | Change | Notes |
|---|---|---|
| `.claude/hooks/sync-default-branch.sh` | **Create** | Script above. `chmod +x` after creation. |
| `.claude/settings.json` | **Edit** | Append the second hook entry inside the existing `SessionStart` matcher object. Do not touch `PostToolUse`. |
| `docs/superpowers/plans/2026-05-14-sync-main-session-start-hook.md` | **Create** | This file. |

No edits to `.claude/settings.local.json`, no edits to existing hook scripts, no changes to git config.
