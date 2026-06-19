# Cold-context review: sync-main-session-start-hook

> Reviewer had no access to the original spec/brainstorm. Critique is based on plan text alone.

---

## Phase 1: Reconstructed problem

**What the plan is trying to solve.** When a Claude Code session starts in this repo, the local default branch (`master`) drifts behind `origin/master`. New branches and new worktrees inherit that staleness, which surfaces later as PR conflicts. The plan installs a `SessionStart` Claude Code hook that *passively* fetches every session and fast-forwards `master` only when it is safe to do so.

**Claimed goals.**
- Always run `git fetch origin` at the start of `startup` and `resume` sessions.
- Fast-forward the local default branch only when the current checkout is on that branch *and* the working tree is clean *and* the FF is strictly possible.
- Never block or slow Claude Code startup (every path exits 0; fetch has a 10s inner timeout, 15s outer).
- Be quiet by default; emit at most one stdout line when something material happened.
- Coexist with the existing `code-review-graph status` hook under the same matcher.

**Explicitly out of scope.**
- `source=clear` (no re-fetch on `/clear`).
- Remotes other than `origin` (e.g., `upstream` for forks).
- Submodules.
- Auto-creating a test runner for the hook script.

**Ambiguities I can't resolve from the plan alone.**
- Whether the user wants the model to *see* the sync line as context, or just see it in the transcript. The plan chooses both via stdout, but the original ask may have preferred silence-from-model.
- Whether "default branch" is meant to be repo-local-discovered each session, or pinned to `master` for this repo. The plan opts for dynamic detection; a simpler hardcode might be what was asked for.
- Whether the requirement was specifically about `master` (the repo's actual default) or genuinely generic. The filename says "sync-main" but the body says `master`.

Because the spec is unavailable, downstream critique may shift if the original ask was narrower (e.g., "just keep master fresh in the main checkout, don't touch worktrees") or broader (e.g., "also rebase active feature branches onto fresh master").

---

## Phase 2: Material decisions, assumptions, alternatives, failure modes

### D1. Hook fires at `SessionStart` (not at pre-tool, not on a cron, not on a daemon)

- **Assumption:** Session starts are frequent enough to keep master fresh, but rare enough that an extra fetch isn't burdensome. The user always opens Claude Code before doing meaningful work.
- **Alternative:** A pre-`Bash` `PreToolUse` hook that fires only when the model is about to run `git checkout -b`, `git worktree add`, or `git pull`. Better when sessions are long and branches are cut mid-session — exactly the failure mode the plan describes ("worktrees fan out from main checkout"). The current plan won't help a long-running session that creates a worktree two hours after startup.
- **Failure mode if assumption wrong:** A user who starts CC once and runs all day creates branches from stale `master` for the rest of the day. The hook doesn't fire again until next `startup`/`resume`. The exact problem statement (staleness propagating into new worktrees) is only mitigated at session boundaries.

### D2. Fetch always; FF only when on the default branch in this checkout

- **Assumption:** The main checkout is where `master` lives, and the user's mental model is "fetch is cheap, FF should be conservative."
- **Alternative:** `git fetch origin master:master` (refspec-update without checkout) when not on master. This updates the local `master` ref from any worktree without touching the current checkout's HEAD. Better when the user spends most of their time in worktrees and rarely sits on `master` itself — which the plan's own context says is the case. The plan rejects pull-style strategies but doesn't address `fetch <refspec>:<refspec>`, which is the right tool for exactly this scenario.
- **Failure mode if assumption wrong:** If the user is almost always in a worktree on a feature branch, the local `master` ref in the main checkout never advances during a session, and new worktrees cut from main still see stale `master` until the user manually `cd`s back. The plan's "fetch is enough" claim is true for `origin/master` but not for `master` (the local tracking branch), and worktrees branch from the local ref, not `origin/master`.

This is the single most consequential decision and may be load-bearing — see Phase 3.

### D3. Default-branch detection: three-tier (symbolic-ref → set-head --auto → main/master probe)

- **Assumption:** Per-session detection is worth the complexity over a hardcoded `master`. The repo might one day rename to `main`, or be reused as a template.
- **Alternative:** Hardcode `default_branch="master"` for this repo. ~30 lines of script disappear. Plan justifies generality but admits in the context section that the repo uses `master`. YAGNI applies.
- **Failure mode if assumption wrong:** Extra code surface to maintain and test (cases 3, 8, 11, 12 in the test matrix exist purely because of this generality). If `origin/HEAD` is set to something unexpected (e.g., a release branch), the hook will sync that instead of `master` — a silent footgun.

### D4. Output: plain stdout, surfaced to both transcript and model

- **Assumption:** The model benefits from knowing the base branch moved. The token cost is negligible.
- **Alternative:** stderr (transcript-only, no model context) or `hookSpecificOutput.additionalContext` (explicit model context, structured). Stderr is better if the user finds model-context pollution annoying across hundreds of sessions; structured output is better if other tooling will consume the line.
- **Failure mode if assumption wrong:** Minor — a small amount of noise in the model's initial context window. Reversible.

### D5. Cleanliness includes untracked files

- **Assumption:** Untracked files indicate WIP the user doesn't want disturbed; safety wins over throughput.
- **Alternative:** Tracked/staged only (matching `git merge --ff-only`'s native behavior). Better when the user routinely has `.envrc.local`, scratch notes, or generated files lying around — they'd see the "dirty, fetched only" message every session and learn to ignore it, which weakens the signal.
- **Failure mode if assumption wrong:** Hook becomes chatty in normal use; signal-to-noise drops; user habituates and ignores genuinely important messages.

### D6. `set -uo pipefail` without `-e`

- **Assumption:** Per-command error handling is more readable than wrapping every command in `|| true`.
- **Alternative:** `set -euo pipefail` with explicit `|| true` only where needed. Standard idiom; easier to onboard.
- **Failure mode if assumption wrong:** Low — a missed error check could let the script proceed with an empty variable. Mitigated by `[[ -n ... ]]` guards in the script, but `ahead_by` is one place where the substitution-default `${ahead_by:-0}` is doing real work that wouldn't be needed under `-e`.

### D7. Two hooks share one matcher; rely on parallel execution

- **Assumption:** Claude Code's parallel hook execution is stable, and interleaved stdout from both hooks is acceptable.
- **Alternative:** Separate matcher entries to serialize. Better if `code-review-graph status` ever emits multi-line output that could interleave with the sync message and confuse the transcript.
- **Failure mode if assumption wrong:** Garbled stdout in the transcript on the rare case both hooks have something to say. Cosmetic.

### D8. 10s inner fetch timeout, 15s outer hook timeout

- **Assumption:** 10s is enough for `git fetch` over a normal connection; 15s outer is enough overhead for jq + script setup.
- **Alternative:** Lower the inner timeout (5s) to fail fast on flaky networks; or run fetch asynchronously and let the hook return immediately, letting the fetch finish in the background. The plan explicitly wants passivity but still blocks startup by 10s on a dead network.
- **Failure mode if assumption wrong:** Slow networks (corporate VPN, hotel Wi-Fi, tethering) consistently hit the 10s timeout, adding a real delay to every session start. Users notice CC feels sluggish on those networks.

### D9. No update to documentation indices

- **Assumption:** Hook scripts don't need to be indexed in `docs/`.
- **Alternative:** Per `docs/superpowers/CLAUDE.md`, "new plans must be added to the index in the relevant subfolder `README.md`." The plan creates a new plan file but does not list a `docs/superpowers/plans/README.md` update in "Files to change / create." That's a missed invariant from the subtree rules.
- **Failure mode if assumption wrong:** Plan index drifts out of date; nested CLAUDE.md invariant violated.

---

## Phase 3: Load-bearing bets

### Bet A (highest impact): "Fetching `origin` is enough to keep new worktrees off stale master"

The plan's core thesis is that worktrees branching from a stale local `master` is the problem, and the fix is to refresh local `master` at session start when possible. But the FF path only runs when the current checkout *is* `master`. If the user starts CC inside a worktree (which the context section says is common), the hook fetches `origin/master` but does **not** advance the local `master` ref. The next `git worktree add -b feature master` still cuts from stale `master`.

- **Evidence that would confirm/refute:** Look at how new worktrees are actually created in this repo. If they use `master` (local ref), the bet is wrong. If they use `origin/master` or `origin/HEAD`, the bet is right. The plan does not surface this evidence.
- **Available?** Partially — git history and shell aliases would show the pattern. Not in the plan.

### Bet B: "Session start is a frequent enough event to keep `master` fresh"

If the user runs `claude` once per day and works for 8 hours, the hook gives one fetch per day. Branches cut at hour 4 still get a stale base.

- **Evidence:** Telemetry on session length and branch-cut frequency. Not available.
- **Available?** Would need to gather (e.g., shell history, git reflog timestamps on branch creation).

### Bet C: "stdout is the right output channel for a one-line tooling notice"

The plan asserts CC reliably surfaces SessionStart stdout to both transcript and model. If the rendering changed, the hook becomes invisible in failure cases the user needs to see (especially the "diverged" warning).

- **Evidence:** Current Claude Code hook documentation and a smoke test against this CC version.
- **Available?** Verifiable via manual smoke test (test plan item 2 covers it).

---

## Verdict

**QUESTIONABLE.**

The script itself is careful, well-bounded, and well-tested. Exit codes, timeouts, and cleanliness semantics are all defensible. The main risk is that the *strategy* (FF only when sitting on master) may not actually solve the stated problem (worktrees branching from stale `master`) for a user who lives in worktrees. A `git fetch origin master:master` refspec update — which is safe in any worktree as long as `master` isn't currently checked out anywhere — would address the root cause more directly and is not discussed at all.

## Questions to answer before implementing

1. In normal use, do you start Claude Code from the **main checkout on master**, or from inside a **worktree on a feature branch**? If the latter is common, this hook's FF path almost never fires, and you should consider `git fetch origin master:master` (with a fallback when `master` is checked out elsewhere) so the local `master` ref advances regardless of where CC starts.
2. Do you want the sync line in the **model's context**, or only in the **transcript**? The plan chooses stdout (both); stderr would be transcript-only.
3. Should the plan index in `docs/superpowers/plans/README.md` be updated as part of this change, per the `docs/superpowers/CLAUDE.md` invariant? The "Files to change / create" table currently omits it.
