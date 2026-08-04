# Subtree Instructions — packages/schemas/

> These rules apply only within `packages/schemas/`. They extend the root `AGENTS.md`.

## Purpose of this subtree

Zod validation schemas for cross-service data contracts: API request bodies and LLM-generated data structures. Runtime validation at service boundaries.

---

## Invariants (must not be broken)

- Zod schemas here are the single source of truth for cross-service validation contracts. Never define a duplicate schema for the same data shape in an individual service.
- Every schema export must include its inferred TypeScript type (`z.infer<typeof Schema>`) so consumers do not need to re-derive the type themselves.
- Schema changes are breaking changes for all consumers. When you change a schema, update all consumer usages in the same PR — do not merge a schema change with broken consumers.
- Keep schemas in sync with the corresponding TypeScript types in `@autodidact/types`. If a type gains a required field, the matching schema must gain the same validation rule. If a schema gains a required field, update the LLM prompt in `@autodidact/prompts` so the LLM produces conforming output.
- `ModuleBlueprintSchema.id` is intentionally `z.string().optional()`. LLM responses sometimes omit this field. The database assigns its own UUIDs — the blueprint `id` is discarded after parsing.

---

## Library / tooling rules

- Use: `zod` exclusively for all validation. Do not use `joi`, `yup`, or `class-validator` in this package.
- Do not use: runtime logic, database queries, or service calls inside schema definitions. Schemas are pure data-shape validators.

---

## Source of truth

- `src/course.ts` — validation for course creation requests and LLM blueprint output.
- `src/chat.ts` — validation for chat session creation and message sending.
- `src/auth.ts` — validation for sign-in and sign-up request bodies.

---

## Key patterns to follow

- Export both the schema and its inferred type from the same file.
- Use `.safeParse()` at LLM output boundaries (where failure is expected and should trigger a retry) and `.parse()` at HTTP request boundaries (where NestJS `ZodValidationPipe` converts the ZodError to a 400 response).

---

## Anti-patterns to avoid

- Do not define a schema in a service controller or graph node if the same shape is already validated here — import instead.
- Do not add business logic (e.g., cross-field dependencies, async validation) to these schemas. Keep them as pure structural validators.

---

## Key Decisions

- [ADR-016 — Runtime schema validation](../../docs/architecture/ADRs/packages/schemas/ADR-016-runtime-schema-validation.md) (Zod)
