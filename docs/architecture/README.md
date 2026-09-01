# Architecture

System architecture documentation for Autodidact.

---

## Purpose

This folder owns the living record of how the system is designed: what exists, why it exists, and the constraints that shape it.

This folder is not responsible for:
- Feature plans (→ [`../superpowers/plans/`](../superpowers/plans/))
- Product decisions (→ [`../product.md`](../product.md))
- Service-level implementation details (→ service `README.md` files in `services/`)

---

## Where this fits

- Parent: [docs/README.md](../README.md)
- Rules: [AGENTS.md](AGENTS.md)

---

## Contents

| File / Folder | Purpose |
|---|---|
| [overview.md](overview.md) | High-level design, request flows, monorepo layers, provider abstraction |
| [agent-graphs.md](agent-graphs.md) | Audit of the current LangGraph agent graphs: node-by-node flow, API→Worker→Agent path, auto-generated diagrams |
| [data-model.md](data-model.md) | ERD, table reference, enums, pgvector usage, RLS, migrations |
| [infrastructure.md](infrastructure.md) | GCP topology, Cloud Run config, Terraform structure, CI/CD, local dev |
| [c4/](c4/) | C4 architecture diagrams: Context → Containers → Components |
| [likec4/](likec4/) | Machine-readable architecture model; the same three levels as interactive diagrams |
| [decisions/](decisions/) | Architecture Decision Records (ADRs) |

---

## Key decisions

- [ADR-001](decisions/ADR-001-monorepo.md) — Monorepo with pnpm + Turborepo
- [ADR-002](decisions/ADR-002-supabase.md) — Supabase for database and auth
- [ADR-003](decisions/ADR-003-expo-mobile.md) — Expo + React Native for mobile

---

## Documentation maintenance

Update this README when:
- A new architecture document is added to this folder.
- A major system change renders an existing doc inaccurate.
