# Folder / Layer Name

> Narrative and human-facing context for this folder.
> Pair file: [`./AGENTS.md`](./AGENTS.md) — agent-binding rules, invariants, source-of-truth.
> Use only the sections that apply. A short useful README is better than a complete but empty one.

## Purpose

What this folder owns.

This folder is responsible for:
- ...

This folder is not responsible for:
- ...

---

## Where this fits

Parent context:
- [Parent README](../README.md)

Related architecture docs:
- ...

Related ADRs:
- ...

---

## Boundaries

Code in this folder may:
- ...

Code in this folder must not:
- ...

Source of truth:
- ...

---

## Important files and folders

```txt
.
├── ...
└── README.md
```

---

## Local conventions

Style, naming, and folder structure conventions for this subtree.

Agent-binding conventions (must-use libraries, testing rules) live in `./AGENTS.md`.

---

## Common workflows

Verification commands the agent must run live in [`./AGENTS.md`](./AGENTS.md). This section covers broader developer workflows.

```bash
pnpm ...
```

---

## Gotchas

- ...

---

## Documentation maintenance

Update this README when changes affect:
- this folder's responsibility
- public interfaces/contracts
- commands/workflows
- integration behavior
- source-of-truth rules
- recurring gotchas

If this README becomes stale, fix it or delete the stale section.
