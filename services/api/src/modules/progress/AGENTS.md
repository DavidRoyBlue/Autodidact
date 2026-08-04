# Subtree Instructions — services/api/src/modules/progress/

> These rules apply only within `services/api/src/modules/progress/`. They extend `services/api/AGENTS.md`.

## Purpose of this subtree

The progress module owns per-user learning state:
- Reading a user's `module_progress` rows for a course
- Completing a module (marking it `'completed'`, recording score, unlocking the next module)
- Marking a module as `'in_progress'` when the user starts it
- Completing an enrollment when all modules are finished

---

## Invariants (must not be broken)

- **`module_progress.status` is authoritative for user progress**: always read `module_progress` (joined with `modules` for ordering) when answering "what is the user's progress?" Never read `modules.status` for this purpose.
- **`modules.status` is the blueprint default**: `modules.status` reflects the course blueprint as written by the Worker. It is not per-user state. Do not conflate it with `module_progress.status`.
- **Sequential unlock rule**: when `completeModule()` runs, it unlocks exactly the one `module_progress` row where the user's status is `'locked'` and the module's `position` is `(completed_module.position + 1)`. This is enforced via a raw SQL `UPDATE ... FROM modules WHERE ...` query. Do not replace this with a Drizzle fluent query unless you verify the position subquery works correctly.
- **Enrollment completion**: after any module completes, if ALL `module_progress` rows for that user+course are `'completed'`, `enrollments.completedAt` is set to `NOW()`. This check runs inside `completeModule()` every time — it is idempotent.
- **`completeModule()` is called only from `ChatService`**: module completion is always triggered by a chat stream ending with `score >= 60`. Do not call `completeModule()` from HTTP controllers, workers, or any other path. If a new trigger is needed, add it to `ChatService` first and update this note.

---

## Source of truth

- Per-user progress state: `module_progress` table (via `@autodidact/db`)
- Module ordering: `modules.position` column
- Enrollment completion: `enrollments.completedAt` column
