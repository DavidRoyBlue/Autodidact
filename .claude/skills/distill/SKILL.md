---
name: distill
description: Manually invoked (/distill, roughly weekly) memory-governance pass — reads this project's auto memory, proposes promotions into CLAUDE.md/rules, prunes stale entries, and presents everything as a diff for approval. Never runs unprompted; never rewrites CLAUDE.md silently.
---

# Distill — auto-memory governance

## Overview

Auto memory is the messy inbox; CLAUDE.md and `.claude/rules/` are the curated source of truth. Only the first ~200 lines / 25KB of `MEMORY.md` load per session, and topic files don't load at all unless read — so lessons left unpromoted rot. This skill moves durable lessons to where they load deterministically, and deletes the rest.

## When to use

- Invoked explicitly via `/distill`, roughly weekly, or after a heavy stretch of sessions.

## When NOT to use

- Never run this unprompted or as part of another task.

## Workflow

1. **Read the auto memory.** Project memory lives at `~/.claude/projects/<project>/memory/` (the `<project>` directory name is derived from this repo's path — find it with `ls ~/.claude/projects/`). Read `MEMORY.md` and every topic file. Also skim per-subagent memories in `.claude/agent-memory/*/` if present.
2. **Classify every entry** into exactly one bucket:
   - **Promote** — durable, reusable lesson (convention, gotcha, contract, command). Target = the **narrowest scope that covers it**: nested `CLAUDE.md` for one subtree → `.claude/rules/*.md` if it's path-triggered across subtrees → root `CLAUDE.md` only if truly universal (root stays ≤ ~100 lines). A lesson that belongs to a procedure goes into that skill's `SKILL.md` instead.
   - **Prune** — stale, contradicted by current code, one-off, or already covered by an existing doc.
   - **Leave** — still useful as working memory but not (yet) durable.
3. **Check for contradictions**: if a memory entry contradicts a CLAUDE.md/rule, the code decides which is right — propose fixing whichever is wrong (pruning rule).
4. **Present the proposal as a diff** — unified diffs for each CLAUDE.md/rules/skill file to be edited, plus the list of memory entries to delete and to leave. **Do not apply anything yet.** Wait for explicit approval; apply only what was approved.
5. **After approval:** apply the edits, then delete the promoted and pruned entries from the memory files (promotion is a move, not a copy — single source of truth). Keep `MEMORY.md` under the 200-line load threshold.

## Definition of done

- [ ] Every memory entry classified (promote / prune / leave) with a one-line reason
- [ ] Each promotion targets the narrowest covering scope; root CLAUDE.md stays ≤ ~100 lines
- [ ] Proposal presented as a reviewable diff **before** any file was modified
- [ ] Nothing applied without explicit approval
- [ ] Promoted/pruned entries removed from memory files after approval; no fact lives in two places
