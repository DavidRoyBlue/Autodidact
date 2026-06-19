# Divergence Report: sync-default-branch SessionStart hook

> Date: 2026-05-14. Comparing ORIGINAL vs PARALLEL plans for the same spec.

Both plans agree on the high-level shape: a bash script at `.claude/hooks/sync-default-branch.sh`, registered as a second entry inside the existing `SessionStart` matcher, always exits 0, never `set -e`, prefers `git fetch` + `git merge --ff-only` over `git pull`, single-line stdout output, dynamic default-branch discovery, and explicit-out-of-scope items (upstream remote, submodules). The material divergences below sit on top of that agreement.

---

## Divergence 1: Behavior when running from a worktree on a feature branch with stale local `master`

**What differs:** ORIGINAL fetches only and exits silently. PARALLEL additionally performs `git update-ref refs/heads/$DEFAULT_BRANCH` to advance the local `master` ref from the feature-branch worktree, gated by a `git worktree list --porcelain` check confirming `master` isn't checked out elsewhere.

- **ORIGINAL assumption:** "FF the default branch only when the current checkout *is* the default branch." Worktree fetch is sufficient — the next time the user lands on `master` in the main checkout, the next SessionStart will FF it then. Cross-worktree ref mutation is risky enough to skip.
- **PARALLEL assumption:** The headline win of the spec ("feature branches cut from stale local master start behind") is only achieved in this repo's actual workflow (always-in-worktrees) if `update-ref` happens from the feature worktree. Worktree-list check fully mitigates the "checked-out elsewhere" trap.

**Load-bearing:** PARALLEL's assumption is more load-bearing. If PARALLEL is wrong about `git worktree list` reliably detecting all checkouts (including bare repos, submodule worktrees, or a `master` worktree someone forgot about), it silently desynchronizes another worktree's HEAD vs working tree — a hostile failure mode. ORIGINAL's "do nothing extra" is strictly safer but leaves the spec's headline benefit on the table for users who rarely return to a `master` checkout.

**Recommendation:** NEEDS-HUMAN. The user's actual workflow determines value: if they nearly always work in worktrees and rarely visit the main `master` checkout, PARALLEL is materially better; if main-checkout-on-master is common, ORIGINAL is sufficient and safer.

---

## Divergence 2: Fetch refspec scope

**What differs:** ORIGINAL runs `git fetch --quiet origin` (whole remote). PARALLEL runs `git fetch --quiet --no-tags origin "$DEFAULT_BRANCH"` (single branch, no tags).

- **ORIGINAL assumption:** A full fetch is standard, predictable, and updates all tracking refs the user might inspect via the graph/UI. Tags are negligible.
- **PARALLEL assumption:** Smallest network footprint is a virtue on flaky connections; updating other tracking refs mid-rebase is a real foot-gun; `--no-tags` avoids tag churn.

**Load-bearing:** Mild. If ORIGINAL is wrong, the user occasionally gets a slower fetch or surprise tracking-ref updates. If PARALLEL is wrong, the user misses updates to other branches they wanted refreshed for free.

**Recommendation:** PARALLEL. Single-branch fetch matches the spec's narrow goal (sync the default branch) and avoids side effects. Easy to widen later if needed.

---

## Divergence 3: Cleanliness check definition

**What differs:** ORIGINAL treats untracked files as **dirty** (`git status --porcelain` with no flags). PARALLEL treats untracked as **clean** (`git status --porcelain=v1 -uno`).

- **ORIGINAL assumption:** "Silently mutating a branch with WIP under the user is hostile, even if `merge --ff-only` would technically succeed against untracked files. Conservative wins."
- **PARALLEL assumption:** "Match `git pull --ff-only` semantics — untracked files don't block a FF and never have."

**Load-bearing:** Moderate. If ORIGINAL is wrong, a user with stray untracked notes never gets their `master` FF'd. If PARALLEL is wrong, a FF lands while the user has unrelated untracked WIP — but the WIP is preserved by git, just the branch ref moves.

**Recommendation:** PARALLEL. Matches well-understood `git pull --ff-only` semantics; users with untracked files won't be surprised.

---

## Divergence 4: Default-branch discovery fallback chain

**What differs:** ORIGINAL: symbolic-ref → `git remote set-head origin --auto` (network call!) → probe `main` then `master`. PARALLEL: symbolic-ref → `git config init.defaultBranch` → probe `master` then `main`.

- **ORIGINAL assumption:** The authoritative source is the remote; `set-head --auto` is the canonical way to populate when missing, and it's offline-safe (fails silently).
- **PARALLEL assumption:** Avoid an extra remote-touching call before the main fetch; `init.defaultBranch` is a cheap local hint; probe order `master` then `main` matches *this* repo's reality.

**Load-bearing:** Low-to-moderate. ORIGINAL's `set-head --auto` adds a second network call (offline-safe but adds latency). PARALLEL's `init.defaultBranch` can lie (it's the *init* default, not necessarily the current default) — but the symbolic-ref check runs first, so the lie is only consulted when there's no other signal.

**Recommendation:** ORIGINAL. The `set-head --auto` fallback is more semantically correct (asks the remote) and `init.defaultBranch` is the wrong abstraction (about repo init, not current trunk). The network cost is acceptable because it only fires on fresh clones where `origin/HEAD` is unset.

---

## Divergence 5: Detection of "default branch checked out elsewhere"

**What differs:** PARALLEL explicitly uses `git worktree list --porcelain` to gate cross-worktree `update-ref`. ORIGINAL does not need this check because it never updates refs from a non-owning worktree.

- **ORIGINAL assumption:** Avoiding `update-ref` entirely removes the need for cross-worktree detection logic.
- **PARALLEL assumption:** Cross-worktree FF is worth the additional detection cost; `git worktree list --porcelain` is cheap and authoritative.

**Load-bearing:** This is a consequence of Divergence 1. If you adopt PARALLEL's cross-worktree update, you inherit the need for and the correctness burden of this check.

**Recommendation:** Coupled with Divergence 1.

---

## Divergence 6: Output prefix/format

**What differs:** ORIGINAL prefixes `sync-default:`. PARALLEL prefixes `[sync-default]`.

- Pure naming/style. Not material.

**Recommendation:** Either. Style choice.

---

## Divergence 7: Inner timeout

**What differs:** ORIGINAL wraps `git fetch` in `timeout 10`, with an outer `settings.json` `timeout: 15`. PARALLEL uses `timeout 8s` inner with `timeout: 10` outer.

- **ORIGINAL assumption:** Inner timeout should be aggressive (10s); outer is hard ceiling defense-in-depth.
- **PARALLEL assumption:** 8s inner leaves a 2s margin for post-fetch work within a 10s outer; aligns with the spec's 10s success-criterion budget.

**Load-bearing:** Low. Both budgets are reasonable.

**Recommendation:** PARALLEL. Tighter alignment with the spec's stated 10s budget and explicit margin reasoning.

---

## Divergence 8: Test plan depth

**What differs:** ORIGINAL ships a 12-row unit table plus 10 manual integration scenarios plus verification commands. PARALLEL defers a test harness ("spec marks it out-of-scope") and provides only a 5-item manual checklist mapped to spec success criteria.

- **ORIGINAL assumption:** Tests for this kind of shell hook are cheap and high-value; document them now even if no harness is wired.
- **PARALLEL assumption:** Spec explicitly defers harness work; the root CLAUDE.md "simplicity first / no speculative features" rule applies.

**Load-bearing:** Low for the implementation itself; moderate for future regression safety.

**Recommendation:** ORIGINAL. The extra test specification doesn't add code — it documents intent. The root rule "test what you change" favors the more explicit plan.

---

## Things one plan considered that the other didn't

| Topic | Only in ORIGINAL | Only in PARALLEL |
|---|---|---|
| Concurrent CC sessions in different worktrees racing `git fetch` | yes (acknowledged, accepted) | no |
| `code-review-graph status` and this hook running in parallel under one matcher (stdout interleaving) | yes | no (assumes sequential ordering) |
| `git worktree list --porcelain` cross-checkout safety | no (not needed by design) | yes (load-bearing for Case C) |
| Disagreement on whether hooks under one matcher run sequentially or in parallel | "parallel" (per docs) | "as declared / sequential" | 
| Risk table | embedded prose | dedicated table |
| `docs/superpowers/README.md` index update | no | yes (per `docs/superpowers/CLAUDE.md` invariant) |
| `init.defaultBranch` as fallback | no | yes |
| `set-head --auto` as fallback | yes | no |

The matcher-ordering disagreement is worth surfacing: ORIGINAL claims parallel, PARALLEL claims sequential. Whichever is true affects nothing in this plan's logic (the two hooks commute) but is a factual claim about Claude Code semantics worth confirming once.

The `docs/superpowers/README.md` index update is required by the subtree CLAUDE.md and ORIGINAL omits it — minor but a real omission.

---

## Verdict

**DIVERGE-MAJOR** — driven almost entirely by Divergence 1 (whether to advance the local default-branch ref from a feature-branch worktree). That single choice changes the script's surface area, introduces a new failure mode (cross-worktree ref desync), and determines whether the spec's headline benefit is delivered to users who always work in worktrees. The other divergences are minor and largely independently resolvable.

## Questions for the human

1. **In your actual workflow, how often do you check out `master` in the main checkout vs always working in worktrees off feature branches?** This decides whether PARALLEL's cross-worktree `update-ref` (Divergence 1) is worth the added complexity and risk, or whether ORIGINAL's "only FF when on master" suffices.
2. **Do you want untracked files to block a FF of `master`, or match `git pull --ff-only` semantics where untracked is clean?** (Divergence 3)
3. **Do you want the test cases documented now (ORIGINAL's 12-row table + 10 integration scenarios) or deferred per the spec's out-of-scope note (PARALLEL's 5-item checklist)?** (Divergence 8)
