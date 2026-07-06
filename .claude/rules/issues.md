---
paths:
  - "docs/superpowers/**"
  - ".claude/issue-map.json"
---

# GitHub issue lifecycle rules

Issue creation and labelling are automated by `.claude/hooks/issues-sync.mjs`. The filename→issue link lives in `.claude/issue-map.json` — never write an `**Issue:**` field into files. Do not manually create issues, edit labels, or close issues on folder moves — the hook and the folder location handle status.

## Marking completion — the owner closes, never Claude (hard rule)

**Never close an issue or set its project-board Status to `Done`.** Marking incomplete work as done — especially a parent with open children — defeats the point of the issue tree. Instead:

- When you finish your part of an issue, apply the **`in-review`** label and **leave it open** (`gh issue edit #N --add-label in-review --remove-label in-progress`). The **owner** verifies and closes.
- **Never** mark a **parent** issue done, closed, or `in-review` while it has **any** open sub-issue. A parent stays `in-progress` until every child is closed *by the owner*.
- Do **not** put `Closes #N` in a PR body (it auto-closes on merge). Write "Part of #N"; the owner closes after review.

## Creating a spec or plan that belongs to a parent

Add `**Parent:** <parent-filename.md>` to the file body alongside `**Date:**`, before writing. The hook resolves that filename to the parent issue and sets the sub-issue relationship. Use the parent's filename, not an issue number.

## When all checkboxes in a plan file are checked off

1. Look up the plan's issue number in `.claude/issue-map.json` (keyed by filename).
2. Mark it **in-review** and leave it **open**: `gh issue edit #N --add-label in-review --remove-label in-progress`.
3. Never mark it `in-review` while any sibling/child issue is still open — it stays `in-progress` until the owner closes its children.
