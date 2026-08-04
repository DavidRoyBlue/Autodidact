# Subtree Instructions — docs/architecture/

> These rules apply only within `docs/architecture/`. They extend `docs/AGENTS.md`.

## Purpose

This folder owns the living record of how the system is designed. Docs here describe *what exists now*, not what might exist in the future.

---

## Invariants (must not be broken)

- `overview.md` describes the current system. Update it when structure changes, not as aspirational design.
- `data-model.md` must stay in sync with `packages/db/src/schema/`. The schema is source of truth; this doc explains it.
- `infrastructure.md` must stay in sync with `infra/`. The Terraform is source of truth; this doc explains it.
- C4 diagrams in `c4/` reflect current reality only. See [`c4/AGENTS.md`](c4/AGENTS.md).
- ADRs in `ADRs/` are append-only for decisions. See [`ADRs/AGENTS.md`](ADRs/AGENTS.md).

---

## Source of truth

| Question | Source of truth |
|---|---|
| Schema column types and constraints | `packages/db/src/schema/` |
| Service scaling and resource config | `infra/environments/prod/main.tf` |
| Provider interfaces | `packages/providers/src/` |
| Migration history | `packages/db/migrations/` |

---

## Key patterns to follow

- When a DB column is added or removed, update `data-model.md`.
- When infrastructure config changes, update `infrastructure.md`.
- When a significant architectural decision is made, create an ADR in `decisions/`.

---

## Anti-patterns to avoid

- Do not put feature plans or roadmap items here.
- Do not describe how something *should* work — only how it *does* work.
- Do not describe internal service implementation details (those belong in the service's own `README.md`).
