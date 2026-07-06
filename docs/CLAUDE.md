# Subtree Instructions — docs/

> These rules apply only within `docs/`. They extend the root `CLAUDE.md`.

## Purpose

`docs/` is the single source of truth for system-level documentation. It is not a scratchpad and not a mirror of code comments.

---

## Invariants (must not be broken)

- `product.md` owns the product vision. Update it when the product changes, not the roadmap.
- `roadmap.md` owns phase-by-phase delivery. Use `[x]` for completed items — do not delete them.
- `stack.md` owns technology choices. Do not add tools here unless a decision was actually made.
- Architecture docs belong in `architecture/`. Feature plans belong in `superpowers/`.
- ADRs are in `architecture/ADRs/`. Read their `CLAUDE.md` before touching them.

---

## Source of truth

| Question | Where to look |
|---|---|
| What does this product do? | `product.md` |
| What's been built / what's next? | `roadmap.md` |
| Why was X technology chosen? | `stack.md` |
| How does the system work? | `architecture/overview.md` |
| Why was X architectural decision made? | `architecture/ADRs/` |
| What are we building next? | `superpowers/plans/` |

---

## Where to document (repo-wide map)

- Local implementation detail → nearest folder `README.md`
- Service/package responsibility → its `README.md`
- Cross-boundary contract → README of the lowest common ancestor folder
- System-wide relationship → `docs/architecture/`
- Durable decision/tradeoff → ADR (`architecture/ADRs/`)
- Agent-binding invariants & verification commands → nearest `CLAUDE.md`
- Path-triggered agent behavior (migrations, tests, issues) → `.claude/rules/`
- Non-obvious code behavior → code comment

---

## Key patterns to follow

- When a technology changes, update both `stack.md` and the affected `architecture/` doc.
- New top-level documents need an entry in `docs/README.md`.
- Cross-link between docs rather than duplicating content.

---

## Anti-patterns to avoid

- Do not put architectural decisions in `product.md` or `roadmap.md`.
- Do not put product decisions in `architecture/`.
- Do not create implementation plans directly in `docs/` root — use `superpowers/plans/`.
- Do not duplicate content between files. Link instead.
