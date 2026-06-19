# Plan: SessionStart hook to keep the local default branch synced with origin (parallel)

> Date: 2026-05-14. Status: Draft. Spec: [2026-05-14-sync-main-session-start-hook.md](../specs/2026-05-14-sync-main-session-start-hook.md).

This is an independent plan generated from the spec alone, intended to be compared against a sibling plan.

---

## 1. Architecture and decomposition

### 1.1 Shape

A single new bash script registered as an additional `SessionStart` hook entry in `.claude/settings.json`, sitting next to the existing `code-review-graph status` entry. No shared state between the two hooks; they run independently and both must remain non-blocking.

Proposed file: `.claude/hooks/sync-default-branch.sh`.

Settings change: add a second `command` entry inside the existing `SessionStart` matcher block. Keep matchers identical (`""`) so both fire on every session start type, and Claude Code orders them as declared. The new hook gets its own `timeout` (10s) so a hang in one cannot starve the other.

### 1.2 Internal phases

The script is deliberately linear with hard early-exits — no functions whose failure could cascade. Each phase is one block, each ends in `exit 0` on any unhappy path.

1. **Preflight gate** — `set +e`; never `set -e`. Refuse to do anything risky:
   - Resolve the script's working directory; if `git rev-parse --is-inside-work-tree` is non-zero, exit 0 silently.
   - Capture `current_branch=$(git symbolic-ref --quiet --short HEAD || echo "")`. Detached HEAD is treated as "not on default" and we never touch the working tree.
   - Determine whether this checkout is the *main* worktree or a linked worktree: `git rev-parse --git-common-dir` vs `--git-dir`. Used only to inform phase 4 logic, not to gate fetch.

2. **Default-branch discovery** — must be dynamic (spec calls out `master` here, `main` elsewhere):
   - Primary: `git symbolic-ref --quiet --short refs/remotes/origin/HEAD` → strip `origin/` prefix.
   - Fallback 1: `git config --get init.defaultBranch`.
   - Fallback 2: probe `master` then `main` for local ref existence.
   - If none resolve, exit 0 silently. We never guess.
   - The result is `DEFAULT_BRANCH` (e.g. `master`).

3. **Fetch origin with hard cap** — the only network call:
   - `timeout 8s git fetch --quiet --no-tags origin "$DEFAULT_BRANCH" 2>/dev/null` (tags omitted per spec open-question default).
   - All non-zero exit codes (offline, auth, DNS, signal-15 from timeout) are swallowed; exit 0 silently if fetch failed. Total budget ≤ 10 s from script start (spec success criterion).

4. **Compare local default vs origin/default** — read-only inspection regardless of which worktree we are in:
   - `local_sha=$(git rev-parse --quiet --verify "refs/heads/$DEFAULT_BRANCH")` — may be empty if no local default branch exists; if so, exit 0 silently.
   - `remote_sha=$(git rev-parse --quiet --verify "refs/remotes/origin/$DEFAULT_BRANCH")`.
   - `base=$(git merge-base "$local_sha" "$remote_sha")` (silenced).
   - Classify into exactly one of: `up-to-date`, `behind` (FF possible), `ahead` (local has unpushed commits), `diverged`. Emit nothing for `up-to-date` or `ahead`.

5. **Act on the default branch only** — never mutate any other branch or any worktree's working tree:
   - **Case A — `behind` AND default branch is checked out in *this* worktree AND working tree is clean:** fast-forward in-place with `git merge --ff-only` against `origin/$DEFAULT_BRANCH`. On success print one line: `[sync-default] master fast-forwarded: <old>..<new> (<N> commits)`.
   - **Case B — `behind` AND default branch is checked out in this worktree AND working tree is *dirty*:** do nothing. Print: `[sync-default] master is N commits behind origin; working tree dirty, skipping FF`.
   - **Case C — `behind` AND default branch is not checked out here (we are on a feature branch, or in a linked worktree):** update the local ref without touching any working tree via `git update-ref refs/heads/$DEFAULT_BRANCH $remote_sha $local_sha` — but only if `$DEFAULT_BRANCH` is not checked out *in any* worktree. Detect with `git worktree list --porcelain` (cheap, local). If it *is* checked out elsewhere, downgrade to Case D output without acting:
     - On successful ref update, print one line: `[sync-default] master advanced to origin/master (was N commits behind)`.
     - If default is checked out in another worktree, print: `[sync-default] master is N commits behind origin (checked out in <path>, not advancing)`.
   - **Case D — `diverged`:** never merge, never reset. Print: `[sync-default] warning: master has diverged from origin/master (local +X, remote +Y) — manual reconciliation needed`.
   - **Case A through D — feature-branch worktrees:** confirm the working branch (`$current_branch`) is never named in any `git` mutation. Asserted by construction: only `update-ref refs/heads/$DEFAULT_BRANCH` and `merge --ff-only` (only when HEAD == default) are used.

6. **Idempotence / `/clear` behavior** — `/clear` reuses the session, so the spec defaults to "not in trigger set". This is configured in `settings.json` by relying on matcher behavior; the script itself takes no special action. If it does re-fire, phase 4 will see `up-to-date` and exit silently.

### 1.3 Files touched

- `.claude/hooks/sync-default-branch.sh` (new, executable).
- `.claude/settings.json` (add second SessionStart hook entry).
- `docs/superpowers/README.md` (index entry for this plan, per `docs/superpowers/CLAUDE.md`).
- Optional: `docs/superpowers/plans/README.md` index — only if such an index already exists.

No README/CLAUDE updates inside `.claude/hooks/` unless one already exists there.

---

## 2. Data flow / interfaces

### 2.1 Inputs

The SessionStart hook contract (Claude Code) hands the script a JSON event on stdin and an event-type the matcher already filtered. This hook does **not** need to parse stdin — its decision logic is entirely derived from the git state of `$PWD`. We `cat` and discard, or simply ignore stdin.

Environment depended on:
- `PWD` (set by Claude Code to the CC working directory).
- `PATH` containing `git`, `timeout`, `awk`, `sed`.

### 2.2 Outputs

- **stdout**: at most one line, prefixed `[sync-default] `. Spec open-question resolved in favor of stdout (visibility + low cost).
- **stderr**: nothing.
- **exit code**: always `0`. Enforced by trailing `exit 0` and by not using `set -e`.

### 2.3 No structured output

Per spec, no `additionalContext` JSON. Plain prefixed line keeps it grep-able in transcripts.

### 2.4 Interaction with the other SessionStart hook

`code-review-graph status` already runs in the same matcher. There is no ordering dependency: graph status is read-only on its own database, and `sync-default-branch.sh` only touches `.git/`. They commute. We do not introduce a wrapper that runs both — keep them as independent `hooks[]` entries so a failure or hang in one cannot block the other.

---

## 3. Assumptions

- The repo's CC config is the per-project `.claude/settings.json` shown in the tree; user-level settings won't shadow it.
- `git`, `timeout` (coreutils), and a POSIX shell are present in WSL2. CC sessions in this repo always have this.
- `origin` is the only remote that matters (explicit spec non-goal).
- Default-branch name is discoverable via `origin/HEAD` after first fetch; if `origin/HEAD` is missing, init.defaultBranch or a probe of `master`/`main` covers ~all real cases. Pathological cases exit silently.
- A "worktree on the default branch" is rare but possible. The plan handles it via the `git worktree list --porcelain` check before any non-checked-out `update-ref`.
- Working-tree cleanliness is judged by `git status --porcelain=v1 -uno` (untracked files do not block FF; that matches normal `git pull --ff-only` semantics).
- Team is small / single-developer in practice; no contention over the local ref. We still gate cross-worktree advancement to avoid the well-known `update-ref` on a checked-out branch trap.
- CC re-runs SessionStart only on session create/resume, not on `/clear`. If this assumption is wrong, idempotence handles it.
- The hook timeout in `settings.json` (10s) is enforced by CC, and `timeout 8s` inside the script gives us a 2s margin to print one line and exit.

---

## 4. Trade-offs and rejected alternatives

### 4.1 Bash script vs Node/TS helper
- **Chosen**: bash, matches existing `.claude/hooks/*.sh` convention.
- **Rejected**: a Node script. Cold-start latency (≥ 200 ms) eats into the 10 s budget for no semantic gain. Bash + `git` is the right size.

### 4.2 Single hook entry wrapping both commands vs two entries
- **Chosen**: two independent SessionStart entries.
- **Rejected**: a wrapper that runs `code-review-graph status` then `sync-default-branch.sh`. Wrapping couples lifecycles and means one timeout governs both. Independent entries let CC time them out independently. The existing `code-review-graph status` entry stays byte-identical.

### 4.3 `git fetch` for the whole remote vs single-branch refspec
- **Chosen**: `git fetch --no-tags origin "$DEFAULT_BRANCH"`. Smallest network footprint, no tag churn, no surprise updates to other tracking branches.
- **Rejected**: `git fetch --all` — pulls every branch, slower on flaky networks, may update tracking refs the user is mid-rebasing against.

### 4.4 `update-ref` from a feature branch vs leaving default stale until next checkout
- **Chosen**: `update-ref` *only when no worktree has the default checked out*. This is the spec's actual goal: "Feature branches cut from a stale local master start behind."
- **Rejected**: do nothing unless the default is currently checked out. Loses the headline win on monorepos that always work in worktrees on feature branches — which is *this* repo's mode.
- **Risk acknowledged**: `update-ref` on a branch checked out in another worktree silently desynchronizes that worktree's HEAD vs working tree. Mitigated by the `git worktree list` check.

### 4.5 `git merge --ff-only` vs `git pull --ff-only`
- **Chosen**: explicit `git fetch` then `git merge --ff-only`. Decouples network (timeout-capped) from local logic. Lets us classify *before* deciding to mutate.
- **Rejected**: `git pull --ff-only` — does both in one breath, harder to attribute failure (was it network or divergence?), and gives less control over output.

### 4.6 stdout vs stderr vs additionalContext
- **Chosen**: stdout, one line, fixed prefix. Spec resolves this open question.
- **Rejected**: `additionalContext` JSON — adds tokens for a one-line passive notice. Stderr — easy to miss in some transcript viewers, and there is no error to signal.

### 4.7 Tag fetching
- **Chosen**: `--no-tags`. Spec default.
- **Rejected**: include tags. No consumer in this repo benefits per-session.

### 4.8 `/clear` in trigger set
- **Chosen**: rely on CC defaults (startup + resume). Idempotent if it fires anyway.
- **Rejected**: explicit `/clear` inclusion. Gratuitous re-fetch.

### 4.9 Test harness
- **Chosen**: defer (spec marks it out-of-scope, deferred).
- **Rejected for this plan**: a `scripts/test-sync-default-branch.sh` harness. Worth a follow-up after the hook lands and we have a real failure to encode.

---

## 5. Risks / things that could invalidate this approach

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `git update-ref` on a branch checked out in another worktree (e.g. user keeps a long-lived `master` worktree) | Medium in heavy-worktree workflows | Other worktree's `git status` shows entire branch as "to commit/remove" until reset | Pre-check via `git worktree list --porcelain`; downgrade to informational-only |
| Default branch discovery fails on a fresh clone where `origin/HEAD` is unset | Medium | Hook does nothing — exactly the desired graceful degradation | Multi-tier fallback; silent exit if all fail |
| `timeout` not present on some minimal images | Low (coreutils standard on WSL2 Ubuntu) | Hard cap not enforced; CC's own 10 s `timeout` field is the backstop | Document the 10 s `timeout` in `settings.json` as authoritative |
| `set -e` mis-applied causing non-zero exit from a benign branch | Medium during code review | Blocks CC startup — explicitly the worst outcome | Never use `set -e`; explicit `exit 0` at the end; trap `EXIT` only if a debug mode is added later |
| Spec assumes a single remote, but a contributor adds a `upstream` remote and expects sync from it | Low for now | None — explicitly out of scope | Deferred env var `SYNC_DEFAULT_REMOTE` flagged in spec |
| Network partial-success: fetch succeeds but ref classification is racey (someone pushes during) | Very low for a single-user repo | At worst, we miss one commit; next session catches up | Accepted |
| CC changes SessionStart hook semantics (e.g. session-start no longer fires on resume) | Low | Reduced freshness, never incorrectness | Accepted; revisit if CC release notes call it out |
| User wants verbose output for debugging | Common | None until they ask | Add `SYNC_DEFAULT_DEBUG=1` env var in a follow-up if requested — not now (spec rule: no speculative features) |

### What would invalidate this plan
- If CC starts running SessionStart hooks in parallel inside the same matcher (currently sequential), the wrapper-vs-two-entries trade-off needs revisiting (still two entries, but ordering claims are moot — fine).
- If the project's trunk renames `master` → `main`, no plan change required: discovery is dynamic.
- If a future requirement asks for *push*-side safety (auto-push merged commits, prune), this hook is no longer the right shape — a new explicit user-invoked command should own that.

---

## 6. Task checklist

- [ ] Create `.claude/hooks/sync-default-branch.sh` per the phase breakdown above, executable. → verify: `bash -n` passes; running it in (a) main checkout on stale master, (b) worktree on feature branch, (c) outside any repo, all exit 0.
- [ ] Add second SessionStart hook entry in `.claude/settings.json` with `timeout: 10`. → verify: JSON validates; existing `code-review-graph status` block unchanged byte-for-byte except surrounding array.
- [ ] Manually validate all five spec success criteria locally:
  - [ ] Stale main checkout → FF + one stdout line.
  - [ ] Worktree on feature branch → fetch happens, no output, feature branch untouched (`git rev-parse HEAD` unchanged).
  - [ ] Offline (disable network) → no output, ≤ 10 s wall time.
  - [ ] Dirty working tree on master + behind → no mutation, info line.
  - [ ] Diverged local master → warning line, no merge.
- [ ] Add this plan + the sibling plan to `docs/superpowers/plans/` index if one exists, per `docs/superpowers/CLAUDE.md`.
- [ ] On completion, prepend `> Completed: YYYY-MM-DD` to the chosen (merged) plan file.
