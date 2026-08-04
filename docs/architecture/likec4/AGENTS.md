# Subtree Instructions — docs/architecture/likec4/

> These rules apply only within `docs/architecture/likec4/`. They extend `docs/architecture/AGENTS.md`.

## Purpose

Maintain one machine-readable model of the current system. Views are queries over that model, not
separate drawings. These are living documents, not historical records.

---

## Invariants (must not be broken)

- The model reflects current reality only. Do not add planned components or future services.
- Every element and relationship is declared exactly once, in `model.c4`. Never redeclare an element
  to make it appear in a second view — add a predicate to the view instead.
- `.likec4rc` must stay present. It is what marks this directory as a LikeC4 project; without it the
  files are not parsed as one model.
- Views must stay derivable. If a diagram needs something the model does not contain, extend the
  model, do not special-case the view.

---

## Library / tooling rules

- Use: LikeC4 DSL (`.c4`), rendered by the `likec4` CLI.
- This folder is the only place in the repo where LikeC4 DSL belongs. The Mermaid C4 diagrams in
  [`../c4/`](../c4/) keep their own tooling rules — do not convert files between the two folders in
  passing.
- All relationships should carry a title, and a technology or protocol where one applies:
  `api -> agent 'course gen' 'HTTP (internal)'`.
- Validate before committing: `npx likec4 validate --json --no-layout docs/architecture/likec4`.

---

## Key patterns to follow

- Tags (`#public`, `#internal`) go **first** in an element body, before `technology` and `description`.
  Anywhere else is a parse error that surfaces as unrelated reference errors in other files.
- Cross-file references need the full FQN (`autodidact.api`). Short names do not carry across files
  even within one project.
- New external system → add a top-level element in `model.c4`. The L1 view includes it automatically.
- New internal service → nest it inside the `autodidact` element. The L2 view includes it automatically.
- New component → nest it inside its service, and add an L3 view only if that service does not have one.

---

## Anti-patterns to avoid

- Do not hand-edit `.likec4/*.likec4.snap` files. Those are saved manual layouts, written by the
  editor UI.
- Do not put infrastructure sizing, scaling limits, or resource config here — those belong in
  `infrastructure.md`.
- Do not add a view for every element. Views are for questions someone actually asks.
