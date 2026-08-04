# Subtree Instructions — docs/architecture/c4/

> These rules apply only within `docs/architecture/c4/`. They extend `docs/architecture/AGENTS.md`.

## Purpose

Maintain accurate C4 diagrams for the current system state. These are living documents, not historical records.

---

## Invariants (must not be broken)

- Diagrams reflect current reality only. Do not add planned components or future services.
- Level numbering is fixed: L1 = context, L2 = containers, L3 = components.
- Each file must link forward to the next level and back to the previous.

---

## Library / tooling rules

- Use: Mermaid `C4Context`, `C4Container`, `C4Component` diagram types.
- Do not use: PlantUML, draw.io, or any other diagram format.
- All `Rel()` entries must include the protocol (e.g., `"HTTPS"`, `"Redis protocol"`, `"SQL"`).

---

## Key patterns to follow

- When adding a new external system, update L1 first, then propagate down to the affected levels.
- When adding a new internal service, update L2 and create or update its L3 component diagram.

---

## Anti-patterns to avoid

- Do not put infrastructure sizing, scaling limits, or resource config in C4 diagrams — those belong in `infrastructure.md`.
- Do not show internal implementation details at L1 or L2.
- Do not omit `Rel()` entries — all significant communication paths must be shown.
