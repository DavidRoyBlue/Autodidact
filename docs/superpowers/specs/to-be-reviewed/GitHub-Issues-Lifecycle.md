# GitHub Issues Lifecycle — Spec

**Date:** 2026-06-24
**Status:** To review
**Scope:** Automated GitHub issue creation, hierarchy, and lifecycle management tied to the Superpowers spec/plan workflow and freeform CC sessions.

> **Revision note (2026-06-24):** Corrected after review. Key changes from the first draft:
> file→issue links now live in a sidecar `.claude/issue-map.json` instead of being written back
> into the file body (fixes the duplicate-issue race and the broken structured-session detection);
> labels are set once by the hook at creation time from folder location, never CC-maintained;
> all model calls use the `claude -p` CLI subprocess (no `ANTHROPIC_API_KEY`); folder names
> corrected to the real tree (`to-be-reviewed`, `in-progress`, `_done`, `plan-in-action`).

> **Revision note (2026-07-18):** Updated to match the shipped implementation, which has
> superseded parts of this spec:
> - All logic now lives in **`issuekit/`** (one config, `issuekit/rules.json`; one CLI,
>   `issuekit/cli.mjs`). The hook is a thin caller of `cli.mjs sync`; backfill is `cli.mjs sync`
>   run standalone. See `issuekit/README.md`.
> - **D3 is superseded on `in-review`:** the shipped model is owner-closes — Claude never
>   closes an issue; it applies the `in-review` label as handoff, and the label is part of the
>   bootstrap (`cli.mjs labels --ensure`). Labels remain a creation-time snapshot otherwise.
> - **D9 is superseded:** PR bodies say "Part of #N", never "Closes #N" — auto-close on merge
>   would bypass the owner's review gate.
> - **Phase 2's CLAUDE.md snippet is superseded** by the current `## GitHub Issues` section in
>   the root `CLAUDE.md` (checkbox completion → mark `in-review`, owner closes).
> - `plan-in-action/` was dropped — the directory never existed.
> - The out-of-scope items "in-review label" and "Projects board" are now in scope, enforced
>   server-side by `parent-close-guard.yml` and `project-status-sync.yml` (thin callers of
>   `cli.mjs check`).

---

## Context

David works in three modes:

1. **Structured** — Superpowers flow: spec written → plan written → plan executed (checkboxes). Either David or CC writes the files; collaboration is expected.
2. **Semi-structured** — CC goes straight to plan, or straight to a freeform task, skipping spec.
3. **Freeform** — David asks CC to build something with no spec or plan file involved.

The goal is to mirror this work automatically into GitHub Issues without David ever manually creating or closing an issue. The issue tree should reflect the actual decomposition of work, not be a parallel thing to maintain. Freeform and standalone sessions also get a record: an issue that is created and immediately closed with a summary, so there is a single place to see what was achieved across **all** sessions — structured and unstructured alike.

---

## Hierarchy

```
Spec issue
  └── Sub-spec issue         (spec that belongs to another spec)
        └── Plan issue       (plan that belongs to a spec/sub-spec)
              └── Sub-plan issue   (plan that belongs to another plan)
```

- Tasks are **not files** — they are checkboxes inside a plan file. A plan issue closes when CC checks off all boxes in the file.
- Any level can be the entry point. Plans can exist without a spec parent. Sub-plans can exist without a spec grandparent.
- Freeform work produces a **standalone flat issue** with no parent, created-and-closed as a session record.

---

## Core design: the sidecar map

The file→issue link lives in a tracked JSON sidecar, **not** in the file body. This is the single change that removes the three failure modes of the first draft (duplicate issues on rewrite, the harness "file modified since read" error, and the unreliable structured-session detection).

**File:** `.claude/issue-map.json` (committed to the repo — it is the durable link and must survive across sessions and clones; if it were gitignored, a fresh clone would re-run backfill and duplicate every issue).

**Format** — keyed by **filename** (basename), which is stable across folder moves (status changes) because the naming invariant `YYYY-MM-DD-kebab-case-name.md` makes basenames effectively unique:

```json
{
  "2026-06-24-github-issues-lifecycle.md": { "issue": 42, "parent": null },
  "2026-06-25-issue-hook-impl.md":         { "issue": 43, "parent": "2026-06-24-github-issues-lifecycle.md" }
}
```

- `issue` — the GitHub issue number for this file.
- `parent` — the **filename** of the parent file (or `null`). The hook resolves this to the parent's issue number via the map. CC declares the relationship by filename because at write time it reliably knows the parent file but not necessarily its issue number.

The file body keeps only `**Date:**` / `**Status:**` (existing convention) and, when applicable, an author-written `**Parent:**` declaration. No `**Issue:**` field is ever written into files.

---

## What lives where

| Mechanism | Purpose |
|---|---|
| `.claude/issue-map.json` | Durable filename→issue link; sole source for "does this file have an issue?" |
| `**Parent:** <filename.md>` field in file | Author-written declaration of hierarchy; hook resolves filename → parent issue via the map |
| GitHub labels | Snapshot of folder-at-creation (`ready` / `in-progress`); informational, not maintained |
| PostToolUse hook (Write) | Creates issue + records it in the map when CC writes a new superpowers file not yet in the map |
| Stop hook | Handles freeform/standalone sessions — match-and-close, or create-and-close as a session record |
| `CLAUDE.md` instructions | Minimal: declare `**Parent:**` on creation; close the plan issue when all checkboxes are checked |

---

## Decisions

**D1 — File→issue link lives in the sidecar, not the file body.** `.claude/issue-map.json` maps filename → `{ issue, parent }`. The hook never edits the source file. Rationale: writing `**Issue:** #N` back into a file CC just wrote (a) races with CC's own rewrites — a second `Write` overwrites the injected field, the hook sees no link and creates a duplicate issue — and (b) marks CC's in-memory copy stale, causing "file modified since read" errors on the next edit. The sidecar removes both.

**D2 — Parent declared by filename.** Store `**Parent:** 2026-06-20-foo.md` in the file body when a plan belongs to a spec, or a sub-spec to a spec. Written by CC at creation, not retroactively. The hook reads this field, looks the parent filename up in the map to get its issue number, and calls the sub-issue API. If the parent is not yet in the map, the hook logs and skips linking — backfill (Phase 5), processed parents-first, repairs it.

**D3 — Labels are a creation-time snapshot, set by the hook from folder location.** Two labels: `ready` (created in `to-be-reviewed/`) and `in-progress` (created in `in-progress/` or `plan-in-action/`). The hook sets the label once, when it creates the issue. Labels are **not** maintained as the file moves between folders — the folder itself remains the live status SSOT (per `docs/superpowers/CLAUDE.md`). This is the deliberate fix for the original draft's three-way status drift (folder + body field + ongoing labels). The first draft's `in-review` label is dropped: it had no creation-time trigger and PR state is already visible through GitHub's native PR↔issue linkage.

**D4 — PostToolUse hook scope.** Fires on the `Write` tool only, not `Edit`. `Edit` is an incremental change to an existing file; `Write` is creation (or full rewrite). The hook checks if the written path is inside the superpowers directory tree (CC verifies the exact root in Phase 0). It looks the file's basename up in the map; if present, it exits silently (no duplicate, even on rewrite). If absent, it creates the issue and records it in the map.

**D5 — Sub-issue relationship via GraphQL.** GitHub's sub-issue link is created with `gh api graphql` calling the `addSubIssue` mutation. The parent issue number is resolved from the `**Parent:**` filename via the map, never inferred. (A REST sub-issues endpoint now also exists; GraphQL is kept for parity with the original design and to avoid extra `gh issue view` round-trips.)

**D6 — Stop hook: freeform/standalone handler.** At the end of every session the Stop hook decides whether the session was structured or freeform:
- **Structured detection (reliable):** scan the transcript for any `Write` tool call whose `file_path` is inside the superpowers tree. If one exists, the PostToolUse hook already created its issue → skip freeform handling. This keys on `file_path` (always present in the transcript) rather than on injected file content, which the first draft relied on and which never appears in the transcript.
- **Freeform/standalone:** call the `claude -p` CLI to find the single open issue most clearly addressed by the session. If matched → comment on and close it. If none → create an issue with the session summary and immediately close it (an intentional session record — see Context).

**D7 — Model calls use the `claude -p` CLI, not the Anthropic API.** David is on a Max subscription; no `ANTHROPIC_API_KEY` exists. All model calls (the Stop hook's match step) shell out to `claude -p` (already authenticated, already on PATH). To prevent infinite recursion — a nested `claude -p` would itself fire the Stop hook — the Stop hook sets a sentinel env var (`ISSUES_SYNC_NESTED=1`) on the subprocess and exits immediately at the top if that var is already present.

**D8 — Backfill.** Existing superpowers files not in the map get issues created once, during Phase 5, parents-first (specs before plans) so parent issues exist before children link to them.

**D9 — No issue auto-close on PR merge cascade.** CC includes `Closes #N` in PR bodies for the deepest relevant issue (the plan, not the spec). GitHub auto-closes that issue on merge. The spec closes manually, or when all its plan sub-issues are closed (CC instruction). Cascading auto-close up the hierarchy is not worth the complexity.

**D10 — Idempotent creation; the map is a cache, not a correctness dependency.** Before creating any issue (both the PostToolUse hook and backfill), search existing issues for an exact-title match and adopt it if found. This means a missing, stale, or never-committed `.claude/issue-map.json` can at worst trigger a harmless re-scan — never duplicate issues. Consequence: there is **no** "remember to commit the map" rule in `CLAUDE.md` — that would reintroduce CC-maintained bookkeeping (the anti-pattern removed in D3). Instead the hook `git add`s the map (Phase 3 step 11) so it rides along with normal commits, and GitHub itself is the dedup backstop. Caveat: title collisions between two different files would adopt the same issue — acceptable given the `YYYY-MM-DD-kebab-case` naming invariant makes H1 titles effectively unique.

---

## Phase 0 — Verify (do this before touching anything)

CC must run all of the following and report findings before implementing any phase. Do not assume — verify.

```bash
# 1. Superpowers folder structure — exact paths
find docs/superpowers -type d | sort

# 2. Sample of existing superpowers files — check for **Parent:** fields and any stray **Issue:** fields
grep -rn "\*\*Parent:\*\*\|\*\*Issue:\*\*" docs/superpowers/ || echo "none found"

# 3. Does the sidecar already exist?
cat .claude/issue-map.json 2>/dev/null || echo "no sidecar yet"

# 4. Existing hooks wiring
cat .claude/settings.json

# 5. Existing hooks directory
ls .claude/hooks/

# 6. CLAUDE.md — read existing content before appending
cat CLAUDE.md

# 7. gh CLI auth and repo
gh auth status
gh repo view --json nameWithOwner

# 8. Existing labels
gh label list

# 9. Node version
node --version

# 10. claude CLI available on PATH (used by the Stop hook instead of the API)
command -v claude && claude --version

# 11. Any existing Stop hook to merge with? (none expected)
grep -n "Stop" .claude/settings.json || echo "no Stop hook registered"
```

From these results CC must determine:
- The exact directory root where superpowers files live, and the real status subfolder names.
- Whether any existing Stop hook logic must be merged rather than replaced (none is expected per Phase 0 #11).
- Whether labels already exist (skip creation if so).
- That the `claude` CLI is available and authenticated (the Stop hook depends on it — there is no API-key fallback).

**Do not proceed to Phase 1 until Phase 0 findings are confirmed.** In particular, confirm the folder names below match reality: this spec assumes `docs/superpowers/{specs,plans}/{to-be-reviewed,in-progress,_done}` plus `docs/superpowers/specs/plan-in-action/`.

---

## Phase 1 — GitHub labels

Create the two labels if they do not already exist:

```bash
gh label create "ready"       --color "0075ca" --description "Created in to-be-reviewed/"
gh label create "in-progress" --color "e4e669" --description "Created in in-progress/ or plan-in-action/"
```

Idempotent — skip any that already exist. (`in-review` is intentionally not created; see D3.)

---

## Phase 2 — CLAUDE.md additions

Append a `## GitHub Issues` section to `CLAUDE.md`. This is deliberately minimal: the hooks do the lifecycle work. The only two things CC must do are (1) declare a parent at creation and (2) close a plan issue when its checkboxes are all done — the one action that requires reading file content rather than watching folder position.

```markdown
## GitHub Issues

Issue creation and labelling are automated by hooks. The filename→issue link lives in
`.claude/issue-map.json` — do not write an `**Issue:**` field into files.

### When creating a spec or plan that belongs to a parent
Add `**Parent:** <parent-filename.md>` to the file body alongside `**Date:**` / `**Status:**`,
before writing. The PostToolUse hook resolves that filename to the parent issue and sets the
sub-issue relationship. Use the parent's filename, not an issue number.

### When all checkboxes in a plan file are checked off
1. Look up the plan's issue number in `.claude/issue-map.json` (keyed by filename).
2. Close it: gh issue close #N -c "All tasks complete."
3. If the plan has a parent and every sibling plan under that parent is also closed,
   close the parent issue too.
4. Include `Closes #N` in the PR body for the deepest relevant issue (the plan, not the spec).

Do not manually create issues, edit labels, or close issues on folder moves — the hooks and the
folder location handle status.
```

---

## Phase 3 — PostToolUse hook

File: `.claude/hooks/issues-sync.mjs`

Wire in `.claude/settings.json` (a `Write` matcher already exists for other hooks — add this as an additional hook entry; multiple `Write` hooks stack and all fire):

```json
"PostToolUse": [
  {
    "matcher": "Write",
    "hooks": [
      {
        "type": "command",
        "command": "node /absolute/path/to/.claude/hooks/issues-sync.mjs"
      }
    ]
  }
]
```

**CC must use the absolute path — not relative — because hooks run from an unpredictable cwd.**

### Hook logic

```
Read stdin → { tool_name, tool_input: { file_path, content }, tool_response, cwd }

1. If tool_name !== "Write" → exit 0

2. Resolve file_path. If not inside the superpowers directory tree → exit 0
   (use the tree root confirmed in Phase 0)

3. basename = path.basename(file_path)
   Load .claude/issue-map.json (treat missing as {}).
   If basename is already a key → exit 0 (already linked; safe on rewrite)

4. Title: the H1 heading (first `# ...` line) of the file; if none, the basename without extension.

5. Label from folder:
   - path contains /to-be-reviewed/                  → ready
   - path contains /in-progress/ or /plan-in-action/ → in-progress
   - path contains /_done/                           → (create, then close in step 8)
   - otherwise                                       → ready

6. Body: first non-heading, non-bold-metadata paragraph, truncated to 500 chars.
   If none, use the title.

7. Idempotency guard (so a lost/uncommitted map can never cause duplicates — see D10):
   Search existing issues for an exact-title match before creating:
   EXISTING=$(gh issue list --state all --search "in:title \"$TITLE\"" \
     --json number,title --jq ".[] | select(.title == \"$TITLE\") | .number" | head -n1)
   If EXISTING is non-empty → N=$EXISTING (adopt it), skip creation, jump to step 10.

8. Create the issue:
   RESULT=$(gh issue create --title "$TITLE" --body "$BODY" --label "$LABEL")
   Parse issue number N from the returned URL.

9. If folder is /_done/ and the issue is open → gh issue close N -c "Created already complete."

10. If file content contains "**Parent:** <name>":
    parentIssue = map[<name>]?.issue
    If parentIssue exists, link via GraphQL:

    gh api graphql -f query='
      mutation($parentId: ID!, $childId: ID!) {
        addSubIssue(input: { issueId: $parentId, subIssueId: $childId }) {
          issue { number }
        }
      }
    ' -f parentId="$(gh issue view <parentIssue> --json id -q .id)" \
      -f childId="$(gh issue view N --json id -q .id)"

    If parentIssue is missing, log "parent <name> not yet linked, skipping" (backfill repairs it).

11. Record in the map and write it back:
    map[basename] = { issue: N, parent: <name> || null }
    Persist .claude/issue-map.json (pretty-printed, sorted keys for clean diffs).
    Then stage it so it rides along with the next commit: git add .claude/issue-map.json
    NOTE: the only files this hook touches are the sidecar (write) and its git index entry
    (stage) — never the source .md file, and it never creates a commit.

12. Log to stderr: [issues-sync] Linked #N: TITLE

Exit 0 always — never block CC.
```

---

## Phase 4 — Stop hook (freeform / standalone handler)

No Stop hook currently exists (confirmed in Phase 0), so create `.claude/hooks/session-issues.mjs` fresh and register it under `Stop` in `.claude/settings.json`.

### Logic

```
0. RECURSION GUARD: if process.env.ISSUES_SYNC_NESTED is set → exit 0
   (the claude -p call in step 6 sets this; without it, the nested session's own
    Stop hook would re-invoke this handler forever)

1. Read stdin → { session_id, stop_hook_active, cwd, transcript_path }
   If stop_hook_active → exit 0

2. Read the transcript (transcript_path).

3. STRUCTURED DETECTION: scan the transcript for any Write tool call whose file_path
   is inside the superpowers tree. If one exists → the PostToolUse hook already created
   its issue → exit 0. (Keyed on file_path, which is always in the transcript.)

4. Extract a session summary (last 3–4 assistant messages, trimmed).

5. Get open issues:
   gh issue list --state open --json number,title --jq '.[] | "\(.number): \(.title)"'

6. Ask claude -p which open issue (if any) the session addressed:
   echo "<summary>\n\nOpen issues:\n<list>" | \
     ISSUES_SYNC_NESTED=1 claude -p --model claude-haiku-4-5 \
       "Return ONLY the number of the single open issue most clearly addressed by this
        session output, or the word null if none matches well."
   (ISSUES_SYNC_NESTED=1 prevents the nested invocation from recursing into this hook.)

7a. If a number is returned (issue N):
    gh issue comment N --body "Addressed in session <YYYY-MM-DD>: <summary>"
    gh issue close N

7b. If null / no match (freeform or standalone work):
    N=$(gh issue create --title "Session: <first line of summary>" \
        --body "<full summary>" --label "ready")
    gh issue close $N -c "Session record — completed."
    (Born-closed by design: a single place to see what every session achieved.)

8. Log to stderr. Exit 0 always.
```

---

## Phase 5 — Backfill existing files

CC runs this once, manually, after all other phases are verified working.

```
1. Find all superpowers files whose basename is not a key in .claude/issue-map.json.
2. Process specs/sub-specs first, then plans/sub-plans (parents before children).
3. For each file:
   a. Title from H1; label from folder (Phase 3 step 5).
   b. Idempotency guard (D10): search existing issues by exact title; if one exists, adopt
      its number into the map instead of creating a new one. This makes backfill safe to
      re-run and harmless if the map was never committed.
   c. If a **Parent:** field exists, confirm the parent is already in the map.
   d. Create the issue (or adopt the existing one), record it in the map, set the sub-issue
      link if a parent exists.
   e. Files in /_done/ → create then immediately close.
   f. Pause 1s between creates to avoid GitHub rate limiting.
4. Report: N issues created, A adopted (already existed on GitHub), M skipped (already in the map).
```

---

## Affected areas

- `.claude/settings.json` — add PostToolUse `Write` hook entry; add `Stop` hook entry
- `.claude/hooks/issues-sync.mjs` — new PostToolUse hook
- `.claude/hooks/session-issues.mjs` — new Stop hook
- `.claude/issue-map.json` — new tracked sidecar (the durable filename→issue map)
- `CLAUDE.md` — new minimal `## GitHub Issues` section
- GitHub repo — 2 new labels (`ready`, `in-progress`)
- Existing superpowers files — **not modified**; their links are recorded in the sidecar during backfill (Phase 5)

---

## Acceptance criteria

- [ ] Writing a new spec file in `to-be-reviewed/` → issue created within seconds, an entry appears in `.claude/issue-map.json`, label `ready` on the issue, **and the .md file is byte-for-byte unchanged**
- [ ] Writing the same file a second time (full rewrite) → **no second issue** is created (basename already in the map)
- [ ] Deleting `.claude/issue-map.json` and re-writing an already-issued file → the existing issue is **adopted** by exact-title match, not duplicated (D10)
- [ ] After issue creation, `.claude/issue-map.json` is **staged** (`git add`) and ready to ride the next commit; the hook never creates a commit itself
- [ ] Writing a plan file with `**Parent:** <spec-filename.md>` → issue created and appears as a sub-issue of the spec's issue in GitHub
- [ ] Checking off all boxes in a plan → CC looks up the issue in the sidecar and closes it
- [ ] Freeform session (no superpowers-tree Write in the transcript) → Stop hook matches-and-closes or creates-and-closes a session-record issue
- [ ] Session where a superpowers file was written → Stop hook detects the superpowers Write and exits without creating a duplicate
- [ ] The Stop hook's `claude -p` call does not recurse (sentinel env var honored)
- [ ] No `ANTHROPIC_API_KEY` is read anywhere; all model calls go through `claude -p`
- [ ] Existing files not in the map → backfill creates issues and records them without modifying any `.md` content
- [ ] Any hook failure → CC session is not blocked (all hooks exit 0 on error)

---

## Out of scope

- Ongoing label sync on folder moves (labels are a creation-time snapshot; folder is the live status SSOT) and the `in-review` label / PR-state reflection
- GitHub Projects board / status fields (labels are sufficient; Projects can be layered on manually)
- Automatic PR creation (CC opens PRs when asked, not automatically)
- Issue assignment or milestone management
- Multi-repo sub-issues (all work is in one repo)
- Deleting issues for deleted files
