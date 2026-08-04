# Subtree Instructions — docs/superpowers/

> These rules apply only within `docs/superpowers/`. They extend `docs/AGENTS.md`.

## Purpose

This folder manages structured planning documents used to guide feature implementation. Plans are inputs to agentic workers, not design explorations.

---

## Status is the subfolder (single source of truth)

A plan's or spec's status is **the subfolder it lives in**. Do not duplicate status anywhere else — move the file to change its status.

- 🔵 `to-be-reviewed/` — proposed / not started
- 🟡 `in-progress/` — implementation underway
- ⚪ `_done/` — completed / shipped

Both `plans/` and `specs/` use these three buckets. Use `git mv` to move files between status folders so history is preserved.

---

## Invariants (must not be broken)

- Plans and specs must use the filename format: `YYYY-MM-DD-kebab-case-name.md`.
- Plans and specs are append-only records. Mark tasks complete with `[x]`; do not delete completed sections, and never delete a `_done/` file.
- Every plan/spec lives in exactly one status subfolder — never loose at `plans/` or `specs/` root. (Review-pipeline byproducts — `*.diff.md`, `*.parallel.md`, `*.review.md` — are the only exception and may sit at the `plans/` root.)
- When a plan/spec is created or moved between status folders, update the relevant subfolder `README.md` index (section + 🔵/🟡/⚪ dot) to match.

---

## Key patterns to follow

- Write a spec first when the design is unsettled. A plan requires knowing what to build.
- Plans use `- [ ]` / `- [x]` task syntax for progress tracking.
- Picking up a plan → `git mv` it from `to-be-reviewed/` to `in-progress/`. Finishing it → `git mv` it to `_done/` and add `> Completed: YYYY-MM-DD` at the top.
- When a spec's feature has fully shipped, `git mv` the spec to `specs/_done/`.

---

## Anti-patterns to avoid

- Do not put implementation code in plans.
- Do not use plans as a scratchpad — keep them structured and task-oriented.
- Do not create plans for changes that fit in a single PR description.
- Do not track status in a file's body or in a status column when the folder already encodes it — that invites drift.
