# Subtree Instructions — <folder name>

> Agent-binding rules for this subtree. Extends root `AGENTS.md`.
> Pair file: [`./README.md`](./README.md) — narrative, workflows, gotchas.
> Fill in applicable sections. Delete sections with no meaningful content — a short focused file beats a complete empty one.

## Purpose

What this subtree owns.

This subtree is responsible for:
- ...

---

## Out of scope

This subtree does NOT own:
- ...

---

## Invariants (must not be broken)

### <Group (e.g., Auth, Data, Networking, UI)>
- ...

### <Group>
- ...

---

## Component relationships

Key pieces and how they connect at runtime. Use resolvable relative links.

- `ComponentName` ([`src/path/to/file.ts`](./src/path/to/file.ts))
  - Reads from: ...
  - Writes to: ...
  - Used by: ...

---

## Entry points

Where an agent should start reading for common tasks.

- Primary entry: [`src/index.ts`](./src/index.ts)
- Feature X entry: [`src/path/feature.ts`](./src/path/feature.ts) — brief note on what it owns

---

## Data flow (summary)

Compressed local data flow. Delete if covered by a deeper doc linked below.

Standard flow:
1. ...
2. ...

<Feature name> flow:
1. ...

---

## Library / tooling rules

- Use:
  - ...
- Do not use:
  - ...

---

## Source of truth

- Concern X: [`src/path.ts`](./src/path.ts)
- Concern Y: ...

---

## Key patterns to follow

- ...

---

## How to extend

### How to add a <feature type>

1. ...
2. ...
3. Do not: ...

---

## Anti-patterns to avoid

- ...

---

## Commands

Commands the agent must run as part of its work in this subtree.

- Tests: `pnpm ...`
- Typecheck: `pnpm ...`
- Lint: `pnpm ...`

Broader workflows (dev setup, debugging, deploy) live in [`./README.md`](./README.md).
