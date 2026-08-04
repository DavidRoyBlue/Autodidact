# C4 Diagrams

C4 architecture diagrams for Autodidact, covering Levels 1–3.

---

## Purpose

These diagrams map the system at different levels of abstraction. Each level zooms in on the one above it.

This folder is not responsible for:
- Deployment topology or resource sizing (→ [`../infrastructure.md`](../infrastructure.md))
- Data model diagrams (→ [`../data-model.md`](../data-model.md))

---

## Where this fits

- Parent: [architecture/README.md](../README.md)
- Rules: [AGENTS.md](AGENTS.md)

---

## Contents

| File | Level | Shows |
|---|---|---|
| [c4-context.md](c4-context.md) | L1 — System Context | Autodidact as a black box + all external actors and systems |
| [c4-containers.md](c4-containers.md) | L2 — Containers | Internal deployment units: API, Agent, Worker, Mobile |
| [c4-components.md](c4-components.md) | L3 — Components | Internal components within each container |

Read top-to-bottom: start with context to orient, then containers for deployment structure, then components for internal detail.

---

## Documentation maintenance

Update diagrams when:
- A new external dependency is introduced.
- A new service or deployment unit is added.
- A component's responsibilities change significantly.
