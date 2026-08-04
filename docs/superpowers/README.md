# superpowers/

Implementation plans and design specs for Autodidact features.

---

## Purpose

This folder stores structured documents produced during feature development:

- **Specs** (`specs/`) — design documents that explore and define a feature before a plan is written.
- **Plans** (`plans/`) — step-by-step task lists created before coding begins, used to guide agentic workers through multi-step features.

This folder is not responsible for:
- Architectural decisions (→ [`../architecture/ADRs/`](../architecture/ADRs/))
- Product vision (→ [`../product.md`](../product.md))
- Roadmap tracking (→ [`../roadmap.md`](../roadmap.md))

---

## Where this fits

- Parent: [docs/README.md](../README.md)
- Rules: [AGENTS.md](AGENTS.md)

---

## Contents

| Folder | Purpose |
|---|---|
| [specs/](specs/) | Design specs — exploration and scoping before planning |
| [plans/](plans/) | Implementation plans — task-level instructions for feature development |

Each is triaged by status into subfolders — **the subfolder a document lives in is its status** (see each folder's `README.md`):

- 🔵 `to-be-reviewed/` — proposed / not started
- 🟡 `in-progress/` — implementation underway
- ⚪ `_done/` — completed / shipped

---

## Lifecycle

```
Spec (specs/to-be-reviewed → specs/in-progress → specs/_done)
                     │
                     ▼
Plan (plans/to-be-reviewed → plans/in-progress → plans/_done)
                     │
                     ▼
              Implementation
```

Plans and specs are not deleted after completion — they move to `_done/` and serve as a record of how and why something was built.
