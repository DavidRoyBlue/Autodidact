# Subtree Instructions — packages/types/

> These rules apply only within `packages/types/`. They extend the root `AGENTS.md`.

## Purpose of this subtree

Shared TypeScript type definitions used across services and packages. No runtime code — compile-time types only.

---

## Invariants (must not be broken)

- TypeScript type definitions only. No runtime code, no Zod schemas, no class definitions, no functions. If it runs at runtime, it does not belong here.
- Zod schemas live in `packages/schemas`, not here. If a type needs runtime validation (e.g., at an API boundary or when parsing LLM output), add the corresponding Zod schema to `packages/schemas` and derive the TypeScript type with `z.infer<>` there.
- Types here are for shared structural types that do not need validation: domain interfaces (`CourseBlueprint`, `ChatMessage`), status string unions (`CourseStatus`, `ModuleStatus`), and job data shapes (`CourseGenerationJobData`).
- Do not import from service packages (`services/api`, `services/agent`, `services/worker`) — types flow from this package outward, not inward.

---

## Library / tooling rules

- No runtime dependencies. The package may import from other `@autodidact/*` packages only if they are also pure-type packages.
- All exports must be `type` or `interface` declarations (or `const` enums if necessary for a specific reason — document the reason).

---

## Source of truth

- `src/course.ts` — domain status unions (`CourseStatus`, `ModuleStatus`, `DifficultyLevel`, `JobStatus`) and blueprint interfaces (`ContentSection`, `ModuleBlueprint`, `CourseBlueprint`).
- `src/chat.ts` — chat domain types (`ChatRole`, `ChatMessage`, `StreamChunk`, `ChatSession`).
- `src/user.ts` — user and auth types (`UserProfile`, `AuthUser`, `ModuleProgressItem`, `UserProgress`).
- `src/jobs.ts` — job queue payload types (`CourseGenerationJobData`, `EmbeddingJobData`).

---

## Anti-patterns to avoid

- Do not add Zod schemas or validation logic here — use `packages/schemas`.
- Do not add class definitions with methods here — use plain interfaces or type aliases.
- Do not duplicate types that are already defined here in individual service files.
