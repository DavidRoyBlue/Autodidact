# ADR Rules

> Extends root AGENTS.md and `docs/architecture/AGENTS.md`. Applies when working in `docs/architecture/ADRs/`.
> See [./README.md](./README.md) for the index of accepted ADRs and open reconsiderations.

## Purpose

This folder holds Architecture Decision Records — durable records of decisions
that will outlive the people who made them. ADRs capture *what* was decided
and *why*, not *how* the system works.

Autodidact ADRs are **decision-area** ADRs, not per-tool ADRs. Each ADR frames
an architectural problem (e.g., "Database platform"), surveys multiple valid
options neutrally, and concludes with a choice. The ADR is a thinking tool,
not a checklist.

## Folder layout (mirrors the repo)

ADRs live in subfolders that match the repo structure:

```
ADRs/
├── ADR-000-ADRtemplate.md
├── README.md
├── AGENTS.md
├── apps/        — decisions scoped to apps/* (e.g., mobile)
├── services/    — decisions scoped to services/* (api, agent, worker)
├── packages/    — decisions scoped to packages/* (db, providers, schemas, observability, ...)
├── infra/       — hosting, IaC, CI/CD
├── cross-cutting/ — decisions that span ≥2 of the above (monorepo, auth strategy, testing, ...)
└── _superseded/ — historical originals when an ADR was split or fundamentally reframed
```

An ADR scoped to a single subsystem goes under that subsystem. An ADR that
spans multiple subsystems goes under `cross-cutting/`.

## When to create an ADR

Create an ADR for an architectural **decision area** when:
- The decision constrains future technical choices.
- It will be expensive to reverse.
- A reasonable person would revisit it in 6+ months and ask "why did we do this?"

Do NOT create an ADR for:
- Single-tool justifications when a broader decision-area ADR already covers it.
- Implementation details (those go in code or folder READMEs).
- Reversible choices (library version bumps, internal refactors).
- Style or naming conventions (those go in AGENTS.md or READMEs).

## How to write an ADR

1. Copy `ADR-000-ADRtemplate.md` to a new file in the appropriate subfolder.
2. Filename format: `ADR-NNN-decision-area-slug.md` (e.g., `ADR-016-runtime-schema-validation.md`). Numbers are global, zero-padded to 3 digits, never reused.
3. Fill every section. An ADR with placeholder bullets is incomplete.
4. Set Status to `Proposed` unless the user explicitly says it's accepted.
5. Add the date in `YYYY-MM-DD` format.
6. Update `README.md` (index + reconsideration list as applicable).

## The bar (mandatory)

**The template is a thinking tool, not a checklist.** A blindly-templated ADR
fails review. Length follows depth, not the other way around.

**First-principles mandate.** Every ADR is written as if the current choice has
not been made yet. Treat the in-use tool as one candidate among the options,
not the default. If first-principles analysis points to a different tool, raise
the 🚩 reconsideration flag — this is an *expected* outcome, not a failure.

**Research is mandatory, not optional.** Before drafting an ADR you must:
- Read the actual code in this repo that uses the relevant tools — usage
  patterns, custom wrappers, places it leaks abstraction.
- Read current vendor docs (capabilities, pricing, limits, deprecations).
- Web-search recent (current-year) comparisons, benchmarks, migration stories,
  production post-mortems. A 2022 comparison is not authoritative about a 2026 tool.
- Surface at least one option you would not have included from habit.
- Do not quote numbers or claims without a source. Label uncertainty as such.

**Writing disciplines:**
- ≥3 options compared, each with concrete (non-generic) Pros and Cons.
- Decision Drivers explain *why in our context*, not in general.
- Rationale must name what is being sacrificed by the choice.
- Reject sales-pitch bullets. "Great DX" is not a Pro; "lets us avoid hand-rolling X" is.
- Active voice in the Decision section.

## Mandatory sections

Every ADR has, in order:
1. Status (with 🚩 flag if applicable, and date)
2. Context (including stack situation paragraph)
3. Non-goals
4. Decision Drivers
5. Options Considered (≥3, each with Pros and Cons)
6. Decision
7. Rationale (with 🚩 reconsideration block if Status is flagged)
8. Consequences (Positive / Negative / Follow-up decisions)

## 🚩 Reconsideration flag

If the analysis concludes that a *different* tool would be a better fit but we
are keeping the current one (legacy/inertia/cost), the ADR is marked
`🚩 Accepted with reconsideration flag` in Status. The Rationale section
includes a `🚩 Reconsideration flag:` block naming:
- The better-fit option,
- Why it would be better,
- Why we are staying with the current choice,
- The specific event or condition that should trigger migration.

Flagged ADRs appear in `README.md` under "🚩 Open reconsiderations" so the
list of pending re-evaluations is visible at a glance.

## Editing existing ADRs

ADRs are **append-only for decisions**. Do NOT:
- Renumber existing ADRs.
- Delete ADRs (move to `_superseded/` instead).
- Change a Decision or Rationale of an Accepted ADR to reflect new thinking.

You MAY:
- Improve documentation quality (tighten options, fix inaccuracies, add citations,
  expand sparse sections) on an Accepted ADR whose decision has not changed —
  add a `Documentation revised: YYYY-MM-DD` note in Status.
- Update Status (e.g., Accepted → Superseded by ADR-NNN).
- Add a short `## Update` heading at the bottom if context shifts after acceptance.

If a decision changes, write a *new* ADR that supersedes the old one. Link
both ways and move the old file to `_superseded/`.

## Status values

Use exactly one of:
- `Proposed` — drafted, not yet agreed.
- `Accepted` — in force, no reservations.
- `🚩 Accepted with reconsideration flag` — in force, but a different option would be a better fit; see Rationale for details.
- `Deprecated` — no longer followed, not replaced.
- `Superseded by ADR-NNN` — replaced by a newer ADR. Move the file to `_superseded/`.

## After creating or accepting an ADR

- Add a one-line reference to the relevant subsystem `README.md` and `AGENTS.md`
  under "Key Decisions," linking to the ADR.
- Update `docs/stack.md` if the decision touches a tool listed there.
- Do not duplicate ADR content elsewhere. Link to it.
