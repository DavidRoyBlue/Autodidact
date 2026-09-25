# @autodidact/schemas

## Purpose

Zod validation schemas for API request bodies and the data AgentPlatform's `course-creator` workflow returns. Used for runtime validation at service boundaries — HTTP request parsing and the worker's parse of the platform run output.

## Consumers

| Consumer | Usage |
|----------|-------|
| `services/api` | `ZodValidationPipe` on controller methods |
| `services/worker` | `GeneratedCourseSchema.safeParse()` on the AgentPlatform run output (ADR-030) |

## Public API

```typescript
import {
  // Course domain
  CreateCourseRequestSchema,   // POST /courses body
  TimeBudgetSchema,            // '30min' | '1h' | '4h' | 'unrestricted'
  DifficultyLevelSchema,
  GeneratedCourseSchema,       // AgentPlatform course-creator run output
  GeneratedModuleSchema,

  // Chat domain
  SendMessageSchema,           // POST /chat/sessions/:id/stream body
  CreateChatSessionSchema,     // POST /chat/sessions body

  // Auth domain
  SignInSchema,
  SignUpSchema,

  // Inferred TypeScript types
  type CreateCourseRequest,
  type GeneratedCourse,
} from '@autodidact/schemas';
```

## Internal Structure

```
packages/schemas/src/
├── course.ts       # Course creation request + AgentPlatform generated-course schemas
├── chat.ts         # Chat session and message schemas
├── auth.ts         # Sign-in / sign-up schemas
├── jobs.ts         # Task payload schemas (CourseGenerationJobSchema, EmbeddingJobSchema)
└── index.ts        # Re-exports all schemas and inferred types
```

## Validation Rules

### `CreateCourseRequestSchema`
```typescript
{
  topic:       z.string().min(3).max(200),
  difficulty:  DifficultyLevelSchema.optional().default('beginner'),
  timeBudget:  TimeBudgetSchema.optional().default('1h'),
}
```

### `GeneratedCourseSchema`
Used by the worker to validate the AgentPlatform run output before persisting it (its `docs/architecture/course-creator.md` §5 is the platform's own contract; this schema is the app's reduced re-parse of it — unknown keys are dropped, not rejected).
```typescript
{
  title:       z.string().min(1),
  description: z.string().min(1),
  difficulty:  DifficultyLevelSchema,
  budget:      z.object({ estimated_minutes: z.number().int().positive() }),
  modules:     z.array(GeneratedModuleSchema).min(1),
}
```

### `GeneratedModuleSchema`
```typescript
{
  position:           z.number().int().min(1),
  title:               z.string().min(1),
  description:         z.string().min(1),
  objectives:          z.array(z.string()),
  content:             z.string().min(1),   // full lesson, markdown
  estimated_minutes:   z.number().int().positive(),
  resources:           z.array(z.object({ url: z.string(), title: z.string(), why: z.string() })),
}
```

### `SendMessageSchema`
```typescript
{
  content: z.string().min(1).max(4000),
}
```

## Usage Example

**In NestJS controller** (via `ZodValidationPipe`):
```typescript
@Post()
@UsePipes(new ZodValidationPipe(CreateCourseRequestSchema))
create(@Body() dto: CreateCourseRequest) {
  return this.coursesService.createOrReuse(user.id, dto);
}
```

**In the worker's platform client** (AgentPlatform run output parsing):
```typescript
const parsed = GeneratedCourseSchema.safeParse(run.output);
if (!parsed.success) {
  throw new Error(`course-creator run ${run.id} returned an invalid course: ${parsed.error.message}`);
}
return parsed.data;
```

## Change Safety Notes

- **Schema ↔ type alignment**: Schemas in this package validate the same data shapes as the TypeScript types in `@autodidact/types`. If you change a type (e.g., add a field to `CourseModule`), add the corresponding validation rule to `GeneratedModuleSchema`.
- **`timeBudget` default**: The default of `'1h'` is set here, not in the frontend. If you change the default, the mobile app's UI will need a matching update to show the correct selected value.
- **`GeneratedCourseSchema` re-parses, it does not author the contract**: the platform validates the whole document against its own schema (`docs/architecture/course-creator.md` §5); this schema only covers the fields the app persists, and a field the platform adds without app support is simply dropped, not an error.

## Key Decisions

- [ADR-016 — Runtime schema validation](../../docs/architecture/ADRs/packages/schemas/ADR-016-runtime-schema-validation.md) (Zod)
