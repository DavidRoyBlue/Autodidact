# Spec: SessionStart hook to keep the local default branch synced with origin

> Date: 2026-05-14. Status: Draft. Related plan: [2026-05-14 — Sync main SessionStart hook](../plans/2026-05-14-sync-main-session-start-hook.md).

## Problem

When a Claude Code session starts in this monorepo, the local default branch (`master`) silently drifts behind `origin/master`. Two failure modes follow:

1. Feature branches cut from a stale local `master` start one or more merges behind without anyone noticing — surfacing only at PR time as merge conflicts.
2. Worktrees fan out from the main checkout. New worktrees branch from whatever the main checkout's `master` happens to be, propagating staleness.

The repo uses `git worktree` heavily. Any naive `git pull` strategy is wrong because it would FF-merge `origin/master` into whatever branch the current worktree is on.

## Goals

- Keep the local default branch fresh **passively** at session start.
- Never block CC startup. Never error.
- Never mutate a feature branch in a worktree.
- Work in WSL2 with potentially flaky/slow network — fail silently and fast on offline.
- Be observable: when something material happens (FF, divergence, dirty-on-default), surface a single human-readable line in the transcript. Silent in the common case.

## Non-goals

- Multi-remote sync (only `origin` matters).
- Submodule handling (this repo has none).
- Branch cleanup, prune of merged branches, or anything beyond keeping the default branch current.
- Replacing `git pull` for users — this is a startup-time-only convenience.
- Acting on non-default branches.

## Constraints

- Trigger: Claude Code `SessionStart` hook. Must work alongside the existing `code-review-graph status` hook in the same matcher.
- Repo: trunk is `master`, not `main`. Solution must detect the default branch dynamically (some repos in the user's workflow are on `main`).
- Worktrees: the hook may run from a worktree on a feature branch, from a worktree on the default branch, from the main checkout, or from outside any git repo.
- Network: WSL2; may be offline, slow, or have auth issues. Hard timeout required.
- Failure surface: every code path must exit 0. Non-zero would block CC startup.
- Hook stack: existing hooks are bash scripts in `.claude/hooks/`. Convention is set.

## Success criteria

- Cold start on a stale main checkout: local `master` is fast-forwarded automatically, with one line surfaced to the user.
- Cold start in a worktree on a feature branch: `origin` is fetched, the feature branch is untouched, no output.
- Cold start offline: no output, no error, startup penalty ≤ 10s.
- Cold start with a dirty working tree on `master` and origin ahead: working tree is untouched, one informational line is surfaced.
- Cold start with diverged local `master` (local has commits origin doesn't): no merge attempted, one warning line is surfaced.
- `/clear` mid-session: hook does not re-fire (or re-fires silently with no fetch).

## Open questions

- Output channel: stdout vs stderr vs `additionalContext` JSON. Picked stdout for visibility + low context cost — confirm.
- Should the hook also fetch tags? (Default: no, per-fetch cost not justified.)
- Should `/clear` be included in the trigger set? (Default: no — already fetched at `startup`/`resume`; re-fetch is gratuitous.)

## Out of scope (deferred)

- A `SYNC_DEFAULT_REMOTE` env var for non-`origin` upstreams.
- A bash test harness at `scripts/test-sync-default-branch.sh`.
- Reporting via OTEL or any structured channel.
