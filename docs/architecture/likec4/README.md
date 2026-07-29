# LikeC4 Model

A single machine-readable architecture model for Autodidact, rendered as interactive diagrams.

---

## Purpose

The Mermaid diagrams in [`../c4/`](../c4/) are three hand-maintained pictures. This folder is one
**model** that those same three levels are derived from as queries.

The practical difference: the Learner, Supabase, the LLM provider and Cloud Tasks are each declared
once here, not redeclared in every level that happens to show them. Add a service to `model.c4` and
every view whose predicates match it picks it up.

This folder is not responsible for:

- Deployment topology or resource sizing (→ [`../infrastructure.md`](../infrastructure.md))
- Data model diagrams (→ [`../data-model.md`](../data-model.md))

---

## Where this fits

- Parent: [architecture/README.md](../README.md)
- Sibling: [c4/README.md](../c4/README.md) — the Mermaid diagrams this model was derived from
- Rules: [CLAUDE.md](CLAUDE.md)

---

## Contents

| File | Holds |
|---|---|
| [spec.c4](spec.c4) | Vocabulary — element kinds, relationship kinds, tags, and their default styling |
| [model.c4](model.c4) | The architecture itself — elements, nesting, and every relationship |
| [views.c4](views.c4) | The four diagrams derived from the model |
| [.likec4rc](.likec4rc) | Project marker. Its presence is what defines this directory as a LikeC4 project |

### Views

| View | Level | Shows |
|---|---|---|
| `index` | L1 — System Context | Autodidact as one box plus every external actor and dependency |
| `containers` | L2 — Containers | Deployable units inside Autodidact and how they communicate |
| `apiComponents` | L3 — Components | Internal components of the API service |
| `agentComponents` | L3 — Components | Internal components of the Agent service |

---

## Viewing

Live preview with hot reload:

```sh
npx likec4 start docs/architecture/likec4
```

Opens on `localhost:5173`. The HMR websocket uses a separate port (auto-picked from 24678–24690).

Validate without rendering — this is the CI-friendly form:

```sh
npx likec4 validate --json --no-layout docs/architecture/likec4
```

Export a static site, or PNGs (PNG export downloads a headless Chromium on first run):

```sh
npx likec4 build  -o dist/architecture docs/architecture/likec4
npx likec4 export png -o docs/architecture/likec4/img docs/architecture/likec4
```

---

## Documentation maintenance

Update the model when:

- A new external dependency is introduced → add it to `model.c4`; the L1 view picks it up via `include *`.
- A new service or deployment unit is added → add it inside the `autodidact` element in `model.c4`.
- A component's responsibilities change → update its `description`.

Only edit `views.c4` when you want to change **which** elements a diagram selects, or how it is styled.
Adding architecture does not require touching it.

One syntax gotcha: tags (`#public`) must come **first** in an element body, before `technology` and
`description`. Putting them last is a parse error, and because parse failures cascade it surfaces as
unrelated "could not resolve reference" errors in the other files.
