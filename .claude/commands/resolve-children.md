---
description: Triage the sub-issues of a parent GitHub issue, then (on approval) implement and commit the ones that are fully autonomous
argument-hint: <parent-issue-number>
---

Resolve the child issues of parent issue **#$1**.

This command runs in two phases. **Phase 1 always runs first and always stops for my
explicit approval.** Never start Phase 2 without it.

Use only the `gh` CLI patterns already in this repo (see `.claude/hooks/issues-sync.mjs`
and `.github/workflows/parent-close-guard.yml`) — no new auth, no new tokens, no new
dependencies.

---

## PHASE 1 — TRIAGE (always runs; always stops)

Do **not** touch any code, file, or git state in this phase. Read only.

1. Fetch the parent and its sub-issues:
   ```bash
   gh issue view $1 --json number,title,body,state
   PARENT_ID=$(gh issue view $1 --json id -q .id)
   gh api graphql -f id="$PARENT_ID" -f query='
     query($id:ID!){ node(id:$id){ ... on Issue {
       subIssues(first:100){ nodes {
         number title state body
         labels(first:20){ nodes { name } }
       } } } } }' \
     --jq '.data.node.subIssues.nodes'
   ```
   Consider only sub-issues whose `state` is `OPEN`. If the parent has no open
   sub-issues, say so and stop.

2. Classify each open sub-issue into exactly one bucket:

   - **AUTONOMOUS** — requirements are fully specified; no design call to make; no
     user-facing copy to invent; no dependency on an unresolved issue; you would be
     confident shipping it without a single follow-up question.
   - **NEEDS_ME** — anything that would make you want to ask me something before or
     during implementation (ambiguous scope, a design/product decision, user-facing
     wording, unclear success criteria).
   - **BLOCKED** — depends on an AUTONOMOUS or NEEDS_ME item in this same batch, or on
     an external issue/PR. Detect dependencies from the sub-issue body (references like
     "depends on #X", "blocked by #X", "after #X", "requires #X") and from sibling
     issue numbers in this batch.

   When in doubt between AUTONOMOUS and NEEDS_ME, choose NEEDS_ME.

3. Print the triage as one compact table, most-actionable first:

   | Issue | Classification | Reason (one line) | Proposed approach |
   |-------|----------------|-------------------|-------------------|

   Fill **Proposed approach** for AUTONOMOUS rows only; leave it blank for the others.

4. Stop.
   - If **every** open sub-issue is NEEDS_ME or BLOCKED, state that plainly and stop
     entirely — there is nothing to execute.
   - Otherwise, ask me to reply **"go"** to run Phase 2. Do not proceed on anything
     other than my explicit approval.

---

## PHASE 2 — EXECUTION (only after I explicitly say "go")

Work through the **AUTONOMOUS** issues in dependency order (a dependency before its
dependent), **one at a time**. For each issue #N:

1. **Implement** the change. Follow the repo's engineering values in `CLAUDE.md`
   (test what you change; surgical, minimal edits).

2. **Reclassify guard.** If, mid-implementation, you hit anything that would make you
   want to ask me a question — an ambiguity, a design call, user-facing copy, a newly
   discovered dependency — **stop that issue immediately**, revert any partial work for
   it, mark it NEEDS_ME, and move on to the next AUTONOMOUS issue. Do not guess.

3. **Commit** with `closes #N` in the message, matching this repo's commit style
   (conventional prefix like `feat(scope):` / `fix:` / `docs:`, a short body, then the
   trailers). Example:
   ```
   feat(<scope>): <what changed> (closes #N)

   <one or two lines on the change>

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   Claude-Session: <this session's URL>
   ```
   Group each issue into its own commit so `closes #N` maps cleanly.

4. **Update `.claude/issue-map.json` — only if an entry already exists for #N.**
   The map is keyed by *filename* with value `{ "issue": N, "parent": ... }` and has
   **no status field**, so a plain close needs no change. Update an entry only when your
   work actually changed its linkage (e.g. you renamed or re-parented a tracked plan
   file). Find the entry by the key whose `.issue` equals N. **Never** add a key for an
   issue that isn't already tracked. If `.claude/issue-map.json` doesn't exist, skip this
   step silently.

### Guardrails (respect the repo's owner-closes model)

- **Never** run `gh issue close`, never set a project-board Status to `Done`, and never
  put a closing keyword in a PR body. The `closes #N` in a commit only takes effect when
  the **owner merges** to `master` — the close stays owner-initiated, and the
  `parent-close-guard` workflow still protects the parent.
- **Never** touch the parent issue #$1 — it stays open until the owner closes it.
- Only act on issues you classified AUTONOMOUS in Phase 1. Leave NEEDS_ME and BLOCKED
  issues untouched.

### End of Phase 2 — summary

Print a final summary using **issue numbers only**:

- **Closed** (committed with `closes #N`): #…
- **Skipped** (BLOCKED / not reached): #…
- **Reclassified** to NEEDS_ME mid-run: #…
