# Cold-Context Plan Review — CI/CD & Dependency Hardening

**Plan reviewed:** `docs/superpowers/plans/2026-06-02-cicd-dependency-fixes.md`
**Mode:** Single-plan critique, no separate spec available. Problem inferred from the plan plus read-only inspection of the actual workflows and manifests.
**Caveat:** The original ~20 findings and the brainstorm that produced them are NOT available. I am reconstructing the problem from the plan and from the live `.github/workflows/` + `package.json` files. Where my critique depends on the unseen findings list, I flag it.

---

## Phase 1 — Reconstruct the problem

**Problem being solved.** A review of 10 GitHub Actions workflows and the monorepo's dependency manifests surfaced ~20 issues across four buckets: security (the repo is public, so the Claude-bot workflows are an attack surface), CI correctness (duplicate validation, missing timeouts/caching/concurrency), deploy hygiene, and dependency drift/duplication. The plan packages the fixes into three sequential, independently-reviewable PRs.

**Goals claimed.**
1. Close the public-repo security holes first (prompt-injection / privilege abuse via `@claude`, dead path filters, version sprawl).
2. Harden CI mechanics (timeouts, turbo cache, composite setup action, audit, dedup of double validation).
3. Reduce dependency entropy (Renovate, TS version pin, SSOT dedup, type alignment, mobile test seed).

**Explicitly out of scope.** Cloud Run deploy hardening — smoke tests, canary, rollback, Docker layer caching — deferred because the deploy pipeline is "aspirational / not yet wired."

**Ambiguities (findings in their own right).**
- **The findings list is not in the plan.** The plan says "~20 findings" but enumerates roughly 18 actions without mapping them 1:1 to findings. A reviewer cannot confirm coverage is complete, nor that a deferred item wasn't actually load-bearing. This is the single biggest cold-context gap: the plan is a *response* to a document it does not restate.
- **Two genuinely open decisions** (mobile testing, Renovate vs Dependabot) are listed but unresolved. Phase 3 then proceeds as if Renovate + mobile vitest are decided ("default"). The plan both defers and assumes — a worker executing Phase 3 has no gate telling them the decision was actually confirmed.
- **"80% coverage" contradiction** is referenced (Phase 2 + open decision) but the source of that claim (a checklist? a PR template? a CONTRIBUTING file?) is never located in the plan, so it's unclear what artifact gets edited.

---

## Phase 2 — Assumptions and alternatives (material decisions only)

### D1. Gate `@claude` on `comment.author_association ∈ {OWNER, MEMBER, COLLABORATOR}`
- **Decision:** Add an `if:` association check so untrusted commenters can't drive a bot that holds `Bash(gh pr *)`.
- **Verified:** `claude.yml` indeed grants `Bash(gh pr *)` and has *no* association gate today. Real hole.
- **Implicit assumption:** `author_association` is a sufficient trust boundary, and the relevant trigger payloads expose it. Note `claude.yml` also triggers on `issues` (opened/assigned) and `pull_request_review` — `github.event.comment.author_association` does **not** exist on those events; the gate must be written per-event or it silently evaluates to empty and either blocks legitimate use or fails open depending on operator precedence.
- **Alternative not considered:** Move the bot trigger to a manual `workflow_dispatch` / label-gated trigger, or split the broad `claude.yml` into least-privilege workflows per event type. Better when the bot's `gh pr` powers are genuinely dangerous on a public repo — association is spoofable in edge cases (a former collaborator, a first-time-contributor whose association is `NONE` but who is actually trusted).
- **Failure mode if wrong:** A multi-event `if:` that only checks `comment.author_association` will mis-gate the `issues`/`pull_request_review` paths — either re-opening the hole on those events or breaking the feature for owners. The plan treats this as one gate; it is at least three.

### D2. Narrow `claude.yml` from `Bash(gh pr *)` to `gh pr comment` / `gh pr view`
- **Decision:** Allowlist subcommands, exclude `merge`/`close`.
- **Implicit assumption:** The current `@claude` usage doesn't depend on broader `gh pr` verbs (edit, review, ready). And that `--allowed-tools` glob narrowing actually constrains the action the way assumed.
- **Alternative not considered:** Drop `gh pr` write powers entirely and rely on the action's native PR-comment mechanism; or keep broad tools but remove the public trigger (defense by trigger, not by tool). Better if you can't enumerate every `gh pr` subcommand contributors rely on.
- **Failure mode if wrong:** Silent capability regression — `@claude` stops being able to do something people relied on, with no test catching it (workflow behavior isn't in `pnpm test`).

### D3. De-duplicate master-push validation via `workflow_run` (or strip deploy's lint/typecheck/test)
- **Decision:** Stop `deploy.yml` from re-running validation that `ci.yml` already ran on the same master push.
- **Verified:** Both `ci.yml` and `deploy.yml` run on `push: master` and both run `pnpm lint && typecheck && test`. Real duplication.
- **Implicit assumption (load-bearing):** `workflow_run` chaining is an acceptable trade. But `workflow_run` triggers run against the **default branch's** workflow definition and add latency + a class of "why didn't my deploy fire" confusion. The alternative "strip validation and rely on branch protection" assumes branch protection *exists and requires the CI check* — which is **not visible in the repo** and not asserted in the plan.
- **Alternative not considered:** Keep deploy self-contained (validation + deploy in one job) and instead make `ci.yml` skip on `push: master` (run CI only on `pull_request`). This removes the duplication from the *other* side, keeps deploy atomic, and avoids `workflow_run` entirely. Better when you want deploy to be a single auditable run and PRs are the real gate.
- **Failure mode if wrong:** If you strip deploy validation and branch protection isn't enforcing the CI check, a direct/force push to master deploys unvalidated code to production. This is a *security/safety regression introduced by a hardening PR* — the worst kind.

### D4. Composite action for the pnpm + Node + install block
- **Decision:** Extract `.github/actions/setup/` consumed by ci + deploy.
- **Implicit assumption:** Two consumers justify the abstraction, and the Claude workflows (which use `checkout@v6` + different setup) won't also want it. Note the root `CLAUDE.md` value #4 "Simplicity first — no abstractions for single-use code"; two call sites is the minimum bar.
- **Alternative not considered:** Leave the ~10 lines duplicated until a third consumer appears. Better given the plan simultaneously deletes one of the two consumers' validation steps (D3) — if deploy stops validating, the composite is used by ci.yml in two jobs at most, weakening the DRY argument.
- **Failure mode if wrong:** Low. Mild over-engineering; cheap to revert.

### D5. SSOT dedup — remove `drizzle-orm`/`pg` from `services/api`, consolidate `bullmq`/`ioredis` toward `@autodidact/providers`
- **Decision:** Eliminate direct DB/queue deps in `services/api`.
- **Verified + tension:** `services/api/package.json` lists `drizzle-orm`/`pg` as **devDependencies** (likely for testcontainers integration tests) and `bullmq`/`ioredis` as **dependencies**. The api `CLAUDE.md` already forbids raw `pg`/drizzle imports and mandates `QUEUE_PROVIDER_TOKEN` injection — so the *source* may already comply while the *manifest* carries them for tests.
- **Implicit assumption:** These are true duplications, not deliberate (e.g., `drizzle-orm`/`pg` present so api integration tests can talk to a testcontainers Postgres directly; `ioredis` present because `bullmq` needs a peer). Removing a transitive-but-declared dep can break type resolution or tests even when runtime imports go through the workspace package.
- **Alternative not considered:** Treat manifest hygiene and runtime-SSOT as separate concerns — verify via the graph which files actually `import` drizzle/pg in api before deleting the manifest entry. Better because the dedup as written is a manifest edit justified by a runtime invariant; those can diverge.
- **Failure mode if wrong:** `pnpm typecheck`/`test` in `services/api` breaks (missing `drizzle-orm` types in test files), or `bullmq` loses its `ioredis` peer. This is the highest-regression-risk item in Phase 3 and it's stated in one line.

### D6. Pin TypeScript once in `@autodidact/config`; align `@types/node` to "the Node 20 runtime"
- **Decision:** Single TS version; align `@types/node`.
- **Verified contradiction:** Root pins `typescript ^5.6.3` and `@types/node ^22.0.0`; `services/api` pins `typescript ^5.5.4` and `@types/node ^22.0.0`. So the real drift is **5.5 vs 5.6**, and `@types/node` is already **22 everywhere I sampled, not 20**.
- **Implicit assumption:** That `@types/node` should match the *runtime* major (20). It generally should not — `@types/node@22` on a Node 20 runtime is common and intentional; downgrading to `@types/node@20` is a regression, not an alignment. The plan's framing ("aligned to the Node 20 runtime") suggests a downgrade that may be wrong.
- **Alternative not considered:** Align `@types/node` to a single version (whatever is highest, 22) for consistency, independent of runtime major. Better and almost certainly the actual intent.
- **Failure mode if wrong:** Downgrading `@types/node` to 20 loses types for APIs the code already uses; or churns the lockfile for no benefit. Low severity but it signals the dependency findings may be imprecise.

### D7. Repair Claude workflows in place; do not consolidate overlapping reviewers
- **Decision:** Fix `claude-api-sync-documentation.yml` paths (`src/api/**` → `services/api/**`, `src/routes/**` → `services/agent/**`) and add a bot self-trigger guard; leave structural overlap alone.
- **Verified:** Path filters are dead (no `src/` dir in this monorepo). The `src/routes/**` → `services/agent/**` remap is a **semantic guess** — the prompt body still says "Review the API changes in src/api and src/routes" and "Update API.md / OpenAPI spec." Remapping the trigger without rewriting the prompt leaves the bot pointed at agent code while instructed to document REST/OpenAPI for the API. The plan fixes the trigger, not the prompt.
- **Implicit assumption:** That fixing path filters makes the workflow correct. But the prompt's instructions and the new paths now disagree.
- **Alternative not considered:** Disable `claude-api-sync-documentation.yml` until the doc-sync intent is re-specified, rather than half-fix it. Better because a workflow with write + PR permissions that fires on every API change and commits AI-generated docs is itself a risk surface the plan never evaluates.
- **Failure mode if wrong:** The "fixed" workflow now fires on real changes, with `contents: write` + `pull-requests: write`, runs a prompt referencing nonexistent dirs, and commits something. A dead workflow is safe; a half-fixed write-capable one is not.

### D8. `pnpm audit` non-blocking now, escalate later
- **Decision:** Add audit, soft-fail initially.
- **Implicit assumption:** Someone watches non-blocking output. Non-blocking audit steps are routinely ignored.
- **Alternative not considered:** Block on critical-only from day one (low false-positive rate) or route audit into the existing weekly maintenance job instead of every CI run. Better if PR latency matters.
- **Failure mode if wrong:** Audit becomes decorative; the security goal of Phase 2/3 isn't actually achieved.

---

## Phase 3 — Load-bearing bets

### Bet A — Branch protection enforces the CI check (underpins D3)
The de-dup of master-push validation only stays safe if direct pushes to master are gated by required status checks. The plan's parenthetical "rely on branch protection" treats this as a given.
- **Evidence needed:** The repo's branch-protection settings (required status checks on `master`). Not in the worktree — must be checked in GitHub repo settings / via `gh api repos/.../branches/master/protection`.
- **Currently available?** No. This is the most important unverified fact and it's invisible in code.
- **If wrong:** A hardening PR introduces an unvalidated-deploy path. Highest-severity failure in the plan.

### Bet B — The `@claude` gate works across all four trigger events (underpins D1, the headline security fix)
`claude.yml` triggers on `issue_comment`, `pull_request_review_comment`, `pull_request_review`, and `issues`. `author_association` lives on different payload fields per event; a single `comment.author_association` check does not cover `issues` or `pull_request_review`.
- **Evidence needed:** Per-event payload schemas (GitHub docs) and a dry-run on a non-collaborator comment on each event type.
- **Currently available?** Partially — the events are visible in the file; the per-event correctness is a known GitHub-Actions gotcha the plan doesn't acknowledge. Verification requires actually testing each path, which the plan's verification section only does for "a non-collaborator comment" (one event).
- **If wrong:** The headline security fix is incomplete; the bot stays drivable via the issues or review paths.

### Bet C — The manifest dedup (D5) reflects true duplication, not test/peer needs
`drizzle-orm`/`pg` are devDeps in api (testcontainers), `ioredis` is bullmq's peer. The plan asserts removal in one line.
- **Evidence needed:** `query_graph imports_of` for drizzle-orm/pg within `services/api` (especially test files), and bullmq's peerDependency on ioredis.
- **Currently available?** Yes, cheaply, via the code-review-graph MCP and the lockfile — but the plan doesn't show it was gathered.
- **If wrong:** api typecheck/test breaks; a "hygiene" PR turns red and blocks the queue of sequential PRs.

---

## Verdict: QUESTIONABLE

The security framing is correct and the two headline findings (ungated `@claude` with `gh pr *`, dead path filters, version split) are real — I confirmed them in the live files. The plan is a sensible *triage*. But three things keep it from SOUND:
1. It rests on an unstated, unverified assumption that branch protection enforces CI (Bet A), and the de-dup it proposes can *introduce* an unvalidated-deploy path.
2. Two of its concrete dependency claims are imprecise against reality (`@types/node` is already 22, not 20; api's drizzle/pg are test-only devDeps), suggesting the underlying findings weren't all re-validated against current manifests.
3. The security gate (D1) and the doc-sync repair (D7) are each described as one fix but are actually multi-part and, done literally, could fail open or activate a half-broken write-capable workflow.

None of these are fatal; all are addressable with a few minutes of verification before coding.

---

## Questions the human should answer before implementation

1. **Is `master` branch protection currently requiring the `CI` status check?** If not, do not strip validation from `deploy.yml` (D3) — that turns a hardening PR into a way to deploy unvalidated code. (Cannot be answered from the repo files; check GitHub settings.)
2. **For the `@claude` gate (D1): is the `if:` written per-event** so the `issues` and `pull_request_review` triggers are also gated, not just `issue_comment`? A single `comment.author_association` check leaves two of the four trigger paths ungated.
3. **For D5/D6: were the manifest entries verified against actual imports and the real installed versions?** Specifically — are api's `drizzle-orm`/`pg` test-only (testcontainers), is `ioredis` bullmq's peer, and is `@types/node` actually 22 everywhere (making "align to Node 20" a downgrade rather than an alignment)?
